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
  MAIN_PATH,
} from '@keezen/shared';

export interface CardInfo {
  value: string;
  suit: string;
  color: MarbleColor;
  fromHand?: boolean;
  /** Pixel offset from the flying card's rest position to the hand card center (for fromHand animation). */
  startDx?: number;
  startDy?: number;
  startAngle?: number;
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
  /** Cartes en vol simultanées lors d'un discard (plusieurs cartes) */
  flyingCards = signal<Array<CardInfo & { flyIndex: number }>>([]);
  displayedGameData = signal<GameStateMessage | null>(null);

  debug = true;

  // ── Timers internes ─────────────────────────────────────────────────────────
  private flyingCardTimeout: ReturnType<typeof setTimeout> | null = null;

  private actionPlayedSub: Subscription | null = null;


  constructor(protected gameStateService: GameStateService) {

    effect(() => {
      this.displayedGameData.set(this.gameStateService.data());
    });

    this.actionPlayedSub = this.gameStateService.actionPlayed$.subscribe((action: Action) => {
      this.runActionSequence(action);
    });
  }

  private async runActionSequence(action: Action): Promise<void> {
    const turnSnapshot = this.gameStateService.newTurn.getValue();

    // Étape 1 : fly card(s)
    if (action.cardPlayed?.length) {
      const isLocalHuman = action.playerColor === this.gameStateService.myPlayerColor();
      if (action.type === 'discard') {
        // Toutes les cartes de la main s'envolent en séquence
        await this.flyDiscardCards(action.cardPlayed, action.playerColor as MarbleColor, isLocalHuman);
      } else {
        const card: CardInfo = {
          value: action.cardPlayed[0].value,
          suit: action.cardPlayed[0].suit,
          color: action.playerColor as MarbleColor,
          fromHand: isLocalHuman,
        };
        await this.flyCard(card);
      }
    }

    // Étape 2 : animation du marble
    await this.animateMarble(action);

    // Étape 3 : signaler la fin
    const currentTurn = this.gameStateService.newTurn.getValue();
    if (currentTurn === turnSnapshot) {
      this.gameStateService.sendAnimationDone();
    }
  }

  /** Vol en séquence de plusieurs cartes (défausse totale). */
  private flyDiscardCards(cards: Array<{ value: string; suit: string }>, color: MarbleColor, fromHand = false): Promise<void> {
    const STAGGER_MS = 220;   // délai entre chaque carte
    const FLY_MS = CARD_FLY_DURATION_MS;

    return new Promise(resolve => {
      // Lancer les cartes une à une avec un stagger
      cards.forEach((c, i) => {
        setTimeout(() => {
          const cardInfo: CardInfo & { flyIndex: number } = {
            value: c.value,
            suit: c.suit,
            color,
            fromHand,
            flyIndex: i,
          };

          // Ajouter la carte au tableau des cartes en vol
          this.flyingCards.update(prev => [...prev, cardInfo]);

          // Au moment de l'atterrissage, alimenter la pile et retirer du vol
          setTimeout(() => {
            const ci: CardInfo = { value: c.value, suit: c.suit, color };
            this.discardPile.update(pile => [ci, ...pile]);
            this.flyingCards.update(prev => prev.filter(fc => fc.flyIndex !== i));

            // Résoudre la promesse quand la dernière carte est posée
            if (i === cards.length - 1) {
              resolve();
            }
          }, FLY_MS);
        }, i * STAGGER_MS);
      });

      // Sécurité : résoudre si cards est vide
      if (cards.length === 0) resolve();
    });
  }

  private flyCard(card: CardInfo): Promise<void> {
    if (card.fromHand) {
      const start = this.gameStateService.playingCardStart();
      if (start) {
        card = { ...card, startDx: start.dx, startDy: start.dy, startAngle: start.angle };
        this.gameStateService.playingCardStart.set(null);
      }
    }
    return new Promise(resolve => {
      this.flyingCard.set(card);
      setTimeout(() => {
        this.discardPile.update(pile => [card, ...pile]);
        this.flyingCard.set(null);
        resolve();
      }, CARD_LAND_DELAY_MS);
    });
  }

  private async animateMarble(action: Action): Promise<void> {
    const type = action.type as ActionType;
    const duration = MARBLE_ANIMATION_DURATIONS[type] ?? 0;

    if (duration === 0) return;

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


    switch (type) {
      case 'enter':
        this.updateMarblePosition(action); // On place le pion sur le 'start'
        await applyAndWait(action.to, { marbleClass: 'marble-entering' });
        break;

      case 'move':
        const steps = this.calculateActionsMove(action);
        // On utilise une boucle for...of pour attendre chaque étape
        for (const step of steps) {
          // 1. On déplace la donnée du pion d'une seule case
          this.updateMarblePosition(step);
          // 2. On attend que l'animation de cette case se termine
          await applyAndWait(step.to, { marbleClass: 'marble-moving' });
        }
        break;

      case 'capture':
        const captureSteps = this.calculateActionsMove(action);

        // 1. Déplacement case par case jusqu'à l'avant-dernière case
        for (let i = 0; i < captureSteps.length - 1; i++) {
          const step = captureSteps[i];
          this.updateMarblePosition(step);
          await applyAndWait(step.to, { marbleClass: 'marble-moving' });
        }

        // 2. Le tout dernier saut : l'impact sur la case cible
        const finalStep = captureSteps[captureSteps.length - 1];

        // On met à jour la position de l'attaquant sur la case finale
        this.updateMarblePosition(finalStep);

        // On déclenche les animations de l'attaquant (slam) et de la victime (éjection)
        await Promise.all([
          applyAndWait(finalStep.from, { marbleClass: 'marble-capturing' }),
          applyAndWait(finalStep.to, { marbleClass: 'marble-captured-exit', squareClass: 'square-impact' }),
        ]);
        break;

      case 'promote':
        this.updateMarblePosition(action);
        await applyAndWait(action.to, { marbleClass: 'marble-promoting', squareClass: 'square-promoting' });
        break;

      default:
        this.updateMarblePosition(action);
    }
  }

  private calculateActionsMove(action: Action): Action[] {
    const calculatePath = (from: number, to: number): number[] => {
      const startIndex = MAIN_PATH.indexOf(from);
      const endIndex = MAIN_PATH.indexOf(to);

      if (startIndex === -1 || endIndex === -1) return [];

      const path: number[] = [];
      let currentIndex = startIndex;

      while (currentIndex !== endIndex) {
        path.push(MAIN_PATH[currentIndex]);
        currentIndex = (currentIndex + 1) % MAIN_PATH.length;
      }
      path.push(MAIN_PATH[endIndex]);

      return path;
    };

    const path = calculatePath(action.from, action.to);
    const actions: Action[] = [];

    // On boucle pour créer une action par segment (ex: 15->6, puis 6->9)
    for (let i = 0; i < path.length - 1; i++) {
      actions.push({
        ...action,             // On copie les infos (playerColor, cardPlayed)
        from: path[i],        // Case de départ du segment
        to: path[i + 1],      // Case d'arrivée du segment
        type: 'move'          // On force le type en 'move'
      });
    }

    return actions;
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

  // ── Interaction humain ────────────────────────────────────────────────────

  /** Vrai si ce pion appartient au joueur local et peut être sélectionné. */
  isSelectableMarble(index: number): boolean {
    if (!this.gameStateService.isMyTurn()) return false;
    return this.getMarbleOnSquare(index) === this.gameStateService.myPlayerColor();
  }

  isSelectedMarble(index: number): boolean {
    return this.gameStateService.selectedMarblePosition() === index;
  }

  /** Marble jouable avec la carte sélectionnée (à mettre en surbrillance). */
  isPlayableMarble(index: number): boolean {
    const playable = this.gameStateService.playableMarblePositions();
    return playable !== null && playable.has(index);
  }

  /** Marble non-jouable avec la carte sélectionnée (à griser). */
  isDimmedMarble(index: number): boolean {
    const playable = this.gameStateService.playableMarblePositions();
    if (playable === null) return false;
    return this.getMarbleOnSquare(index) === this.gameStateService.myPlayerColor() && !playable.has(index);
  }

  onMarbleClick(index: number): void {
    if (!this.isSelectableMarble(index)) return;

    const current = this.gameStateService.selectedMarblePosition();
    this.gameStateService.selectedMarblePosition.set(current === index ? null : index);
  }
}