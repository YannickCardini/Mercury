import { Component, HostListener, OnInit, OnDestroy, signal, effect } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { TockCardComponent } from 'src/app/shared/tock-card.component';
import { Subscription } from 'rxjs';

import {
  MarbleColor,
  ActionType,
  Action,
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
  GameStateMessage,
} from '@keezen/shared';

export interface CardInfo {
  value: string;
  suit: string;
  color: MarbleColor;
}

export interface SquareAnimation {
  marbleClass: string;
  squareClass?: string;
}

@Component({
  selector: 'app-board',
  templateUrl: 'board.component.html',
  styleUrls: ['board.component.scss'],
  imports: [IonCol, IonRow, IonGrid, CommonModule, TockCardComponent]
})
export class BoardComponent implements OnInit, OnDestroy {

  // ── Config plateau ──────────────────────────────────────────────────────────
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
  discardPile = signal<CardInfo[]>([]);
  flyingCard = signal<CardInfo | null>(null);
  displayedGameData = signal<GameStateMessage | null>(null);

  debug = true;

  // ── Timers internes ─────────────────────────────────────────────────────────
  private flyingCardTimeout: ReturnType<typeof setTimeout> | null = null;

  private actionPlayedSub: Subscription | null = null;


  constructor(private gameStateService: GameStateService) {

    effect(() => {
      this.displayedGameData.set(this.gameStateService.data());
    });

    this.actionPlayedSub = this.gameStateService.actionPlayed$.subscribe((action: Action) => {
      this.runActionSequence(action);
    });
  }

  private async runActionSequence(action: Action): Promise<void> {

    // Étape 1 : fly card (si applicable)
    if (action.cardPlayed?.length && action.type !== 'discard') {
      const card: CardInfo = {
        value: action.cardPlayed[0].value,
        suit: action.cardPlayed[0].suit,
        color: action.playerColor as MarbleColor,
      };
      await this.flyCard(card);
    }

    // Étape 2 : animation du marble
    await this.animateMarble(action);

    // Étape 3 : signaler la fin
    this.gameStateService.sendAnimationDone();
  }

  private flyCard(card: CardInfo): Promise<void> {
    return new Promise(resolve => {
      this.flyingCard.set(card);
      setTimeout(() => {
        this.discardPile.update(pile => [card, ...pile]);
        this.flyingCard.set(null);
        resolve();
      }, CARD_LAND_DELAY_MS);
    });
  }

  private animateMarble(action: Action): Promise<void> {
    return new Promise(resolve => {
      const type = action.type as ActionType;
      const duration = MARBLE_ANIMATION_DURATIONS[type] ?? 0;

      if (duration === 0) {
        resolve();
        return;
      }

      const applyAndWait = (index: number, anim: SquareAnimation) => {
        return new Promise<void>(res => {
          this.squareAnimations.update(prev => ({ ...prev, [index]: anim }));

          setTimeout(() => {
            this.squareAnimations.update(prev => {
              const next = { ...prev };
              delete next[index];
              return next;
            });
            res();
          }, duration);
        });
      };

      this.updateMarblePosition(action);

      switch (type) {
        case 'enter':
          // On change 'marble-enter' par 'marble-entering'
          applyAndWait(action.to, { marbleClass: 'marble-entering' }).then(resolve);
          break;

        case 'move':
          // On change 'marble-move' par 'marble-moving'
          applyAndWait(action.to, { marbleClass: 'marble-moving' }).then(resolve);
          break;

        case 'capture':
          Promise.all([
            applyAndWait(action.from, { marbleClass: 'marble-capturing' }),
            applyAndWait(action.to, { marbleClass: 'marble-captured-exit', squareClass: 'square-impact' }),
          ]).then(() => resolve());
          break;

        case 'swap':
          Promise.all([
            applyAndWait(action.from, { marbleClass: 'marble-swapping' }),
            applyAndWait(action.to, { marbleClass: 'marble-swapping' }),
          ]).then(() => resolve());
          break;

        case 'promote':
          applyAndWait(action.to, { marbleClass: 'marble-promoting', squareClass: 'square-promoting' }).then(resolve);
          break;

        default:
          resolve();
      }
    });
  }

  private updateMarblePosition(action: Action): void {
    this.displayedGameData.update(current => {
      if (!current) return current;

      // On crée une copie profonde de l'état pour déclencher la mise à jour
      const updatedPlayers = current.gameState.players.map(p => {
        if (p.color === action.playerColor) {
          // On remplace l'ancienne position par la nouvelle dans le tableau
          const marblePositions = [...p.marblePositions]; // Copie du tableau
          const idx = marblePositions.indexOf(action.from);

          if (idx !== -1 && action.to !== 0) {
            marblePositions[idx] = action.to;
          }

          return { ...p, marblePositions }; // Retourne le joueur mis à jour
        }
        return p;
      });

      return {
        ...current,
        gameState: { ...current.gameState, players: updatedPlayers }
      };
    });
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get topDiscardCard(): CardInfo | null {
    return this.discardPile()[0] ?? null;
  }

  getMarbleAnimClass(index: number): string {
    return this.squareAnimations()[index]?.marbleClass ?? '';
  }

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

  ngOnDestroy(): void {
    this.actionPlayedSub?.unsubscribe();
    if (this.flyingCardTimeout) clearTimeout(this.flyingCardTimeout);
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
    return this.displayedGameData()?.gameState.players.find(p => p.color === color);
  }

  /** 5 slots fixes pour l'affichage de la main (indices 0–4) */
  readonly fiveSlots = [0, 1, 2, 3, 4];

  isCurrentTurn(color: MarbleColor): boolean {
    return this.displayedGameData()?.gameState.currentTurn === color;
  }

  getMarbleOnSquare(index: number): MarbleColor | null {
    const gameData = this.displayedGameData();
    if (!gameData || !this.gameStateService.isConnected()) return null;

    const player = gameData.gameState.players.find(p =>
      (p.marblePositions ?? []).includes(index)
    );
    return player ? player.color as MarbleColor : null;
  }
}