import { Component, HostListener, OnInit, signal, effect } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { TockCardComponent } from 'src/app/shared/tock-card.component';

import {
  MarbleColor,
  ActionType,
  Player,
  GRID_SIZE,
  SQUARES_TO_DISPLAY,
  HOME_POSITIONS,
  START_POSITIONS,
  ARRIVAL_POSITIONS,
  PLAYER_INFO_STARTS,
  SKIPPED_INDICES,
  MARBLE_ANIMATION_DURATIONS,
  CARD_LAND_DELAY_MS,
  CARD_FLY_DURATION_MS,
} from '@keezen/shared';

export interface CardInfo {
  value: string;
  suit: string;
  color: MarbleColor;
}

export interface SquareAnimation {
  /** Classe CSS à appliquer sur le .marble */
  marbleClass: string;
  /** Classe CSS optionnelle à appliquer sur la .case-path */
  squareClass?: string;
}

@Component({
  selector: 'app-board',
  templateUrl: 'board.component.html',
  styleUrls: ['board.component.scss'],
  imports: [IonCol, IonRow, IonGrid, CommonModule, TockCardComponent]
})
export class BoardComponent implements OnInit {

  // ── Config plateau (depuis @keezen/shared) ──────────────────────────────────
  readonly gridSize = GRID_SIZE;
  readonly homes = HOME_POSITIONS;
  readonly arrivals = ARRIVAL_POSITIONS;
  readonly starts = START_POSITIONS;
  readonly playerInfoStarts = PLAYER_INFO_STARTS;
  readonly skippedIndices = SKIPPED_INDICES;

  // ── État UI ─────────────────────────────────────────────────────────────────
  squareSize: number = 0;
  squareToDisplay: number[] = SQUARES_TO_DISPLAY;

  squareAnimations = signal<Record<number, SquareAnimation>>({});

  /** Pile de défausse : toutes les cartes jouées, la dernière en tête */
  discardPile = signal<CardInfo[]>([]);

  /** Carte en vol (animation d'arrivée sur la pile), null quand pas d'animation */
  flyingCard = signal<CardInfo | null>(null);

  debug = true;

  // ── Timers internes ─────────────────────────────────────────────────────────
  private animationTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
  private flyingCardTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Constructor ─────────────────────────────────────────────────────────────

  constructor(private gameStateService: GameStateService) {
    effect(() => {
      const gameData = this.gameStateService.data();
      const lastAction = gameData?.gameState?.currentTurn?.lastAction;
      if (!lastAction) return;

      if (lastAction.cardPlayed) {
        // playerColor est maintenant directement dans l'action — plus besoin
        // de recalculer la couleur du joueur précédent.
        const card: CardInfo = {
          value: lastAction.cardPlayed.value,
          suit: lastAction.cardPlayed.suit,
          color: (lastAction.playerColor ?? gameData?.gameState?.currentTurn?.color) as MarbleColor,
        };
        this.triggerCardAnimation(card);

        // Marble animations déclenchées après l'atterrissage de la carte
        setTimeout(() => this.triggerMarbleAnimation(lastAction), CARD_LAND_DELAY_MS);
      } else {
        // Pas de carte jouée (ex: action automatique) → marble immédiatement
        this.triggerMarbleAnimation(lastAction);
      }
    });
  }


  // ── Animations ──────────────────────────────────────────────────────────────

  /** Déclenche l'animation marble correspondant au type d'action. */
  private triggerMarbleAnimation(lastAction: { type: string; from: number; to: number }): void {
    const type = lastAction.type as ActionType;
    const duration = MARBLE_ANIMATION_DURATIONS[type] ?? 700;

    switch (type) {
      case 'enter':
        this.triggerAnimation(lastAction.to, { marbleClass: 'marble-entering' }, duration);
        break;

      case 'move':
        this.triggerAnimation(lastAction.to, { marbleClass: 'marble-moving' }, duration);
        break;

      case 'capture':
        this.triggerAnimation(lastAction.to, {
          marbleClass: 'marble-capturing',
          squareClass: 'square-impact',
        }, duration);
        this.triggerAnimation(lastAction.from, {
          marbleClass: 'marble-captured-exit',
        }, duration);
        break;

      case 'swap':
        this.triggerAnimation(lastAction.from, { marbleClass: 'marble-swapping' }, duration);
        this.triggerAnimation(lastAction.to, { marbleClass: 'marble-swapping' }, duration);
        break;

      case 'promote':
        this.triggerAnimation(lastAction.to, {
          marbleClass: 'marble-promoting',
          squareClass: 'square-promoting',
        }, duration);
        break;
    }
  }

  /**
   * Déclenche une animation sur une case. Pour forcer le re-trigger CSS si
   * la même classe est déjà présente, on passe d'abord par un état vide (RAF).
   */
  private triggerAnimation(index: number, anim: SquareAnimation, duration: number): void {
    const existing = this.animationTimeouts.get(index);
    if (existing) clearTimeout(existing);

    this.squareAnimations.update(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });

    requestAnimationFrame(() => {
      this.squareAnimations.update(prev => ({ ...prev, [index]: anim }));

      const timeout = setTimeout(() => {
        this.squareAnimations.update(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        this.animationTimeouts.delete(index);
      }, duration);

      this.animationTimeouts.set(index, timeout);
    });
  }

  /**
   * Déclenche l'animation de vol de la carte jouée, puis l'empile sur la pile.
   */
  private triggerCardAnimation(card: CardInfo): void {
    if (this.flyingCardTimeout) clearTimeout(this.flyingCardTimeout);

    this.flyingCard.set(null);
    requestAnimationFrame(() => {
      this.flyingCard.set(card);
      this.flyingCardTimeout = setTimeout(() => {
        this.discardPile.update(pile => [card, ...pile]);
        this.flyingCard.set(null);
        this.flyingCardTimeout = null;
      }, CARD_LAND_DELAY_MS);
    });
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get topDiscardCard(): CardInfo | null {
    return this.discardPile()[0] ?? null;
  }

  /** Classes CSS d'animation pour le .marble d'une case */
  getMarbleAnimClass(index: number): string {
    return this.squareAnimations()[index]?.marbleClass ?? '';
  }

  /** Classes CSS d'animation pour la .case-path d'une case */
  getSquareAnimClass(index: number): string {
    return this.squareAnimations()[index]?.squareClass ?? '';
  }

  get rows(): number[] { return Array(this.gridSize).fill(0).map((_, i) => i); }
  get cols(): number[] { return Array(this.gridSize).fill(0).map((_, i) => i); }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit() {
    this.calculateSquareSize();
    this.injectAnimationDurations();
  }

  private injectAnimationDurations(): void {
    const root = document.documentElement;
    root.style.setProperty('--anim-enter', `${MARBLE_ANIMATION_DURATIONS.enter}ms`);
    root.style.setProperty('--anim-move', `${MARBLE_ANIMATION_DURATIONS.move}ms`);
    root.style.setProperty('--anim-capture', `${MARBLE_ANIMATION_DURATIONS.capture}ms`);
    root.style.setProperty('--anim-swap', `${MARBLE_ANIMATION_DURATIONS.swap}ms`);
    root.style.setProperty('--anim-promote', `${MARBLE_ANIMATION_DURATIONS.promote}ms`);
    root.style.setProperty('--anim-card-fly', `${CARD_FLY_DURATION_MS}ms`);
  }

  @HostListener('window:resize')
  onResize() {
    this.calculateSquareSize();
  }

  calculateSquareSize() {
    const wrapper = document.querySelector('.board-wrapper');
    if (!wrapper) return;

    const bounds = wrapper.getBoundingClientRect();
    const containerSize = Math.min(bounds.width, bounds.height) * 0.95;
    this.squareSize = containerSize / this.gridSize;
    this.gameStateService.boardContainerSize.set(this.calculateTableWrapperSize(containerSize));
  }

  private calculateTableWrapperSize(containerSize: number): number {
    const borderSize = 2;
    const padding = 0.2;
    return (containerSize + borderSize) + (((containerSize + borderSize) / this.gridSize) * padding) * 2;
  }

  // ── Template helpers ────────────────────────────────────────────────────────

  getSquareIndex(row: number, col: number): number {
    return row * this.gridSize + col + 1;
  }

  shouldSkip(index: number): boolean {
    return this.skippedIndices.includes(index);
  }

  getSquareClass(index: number): string {
    if (!this.squareToDisplay.includes(index)) return 'case-hidden';

    for (const [color, pos] of Object.entries(this.starts)) {
      if (pos === index) return `case-path start start-${color}`;
    }
    for (const [color, positions] of Object.entries(this.homes)) {
      if ((positions as number[]).includes(index)) return `case-path home home-${color}`;
    }
    for (const [color, positions] of Object.entries(this.arrivals)) {
      if ((positions as number[]).includes(index)) return `case-path arrival arrival-${color}`;
    }
    return 'case-path normal';
  }

  getPlayer(color: MarbleColor): Player | undefined {
    return this.gameStateService.data()?.gameState.players.find(p => p.color === color);
  }

  isCurrentTurn(color: MarbleColor): boolean {
    return this.gameStateService.data()?.gameState.currentTurn.color === color;
  }

  getMarbleOnSquare(index: number): MarbleColor | null {
    const gameData = this.gameStateService.data();
    if (!gameData || !this.gameStateService.isConnected()) return null;

    const player = gameData.gameState.players.find(p =>
      (p.marblePositions ?? []).includes(index)
    );
    return player ? player.color as MarbleColor : null;
  }
}