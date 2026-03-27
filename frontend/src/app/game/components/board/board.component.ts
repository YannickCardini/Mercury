import { Component, HostListener, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { SoundService } from '../../services/sound.service';
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
  ENTER_IMPACT_DURATION_MS,
  MARBLE_EJECTED_DURATION_MS,
  CARD_LAND_DELAY_MS,
  CARD_FLY_DURATION_MS,
  GameStateMessage,
  MAIN_PATH,
  getPositionAfterMove,
  getLegalAction,
  getActionForSteps,
  type LegalMoveContext,
} from '@mercury/shared';

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

  // ── Preview de mouvement ────────────────────────────────────────────────────
  /** Position de la bille survolée (pour la preview de trajet). */
  hoveredMarble = signal<number | null>(null);

  /** Squares à mettre en évidence : chemin intermédiaire + destination. */
  previewInfo = computed<{ path: Set<number>; destination: number | null }>(() => {
    if (!this.gameStateService.isMyTurn()) return { path: new Set(), destination: null };

    const card = this.gameStateService.selectedCard();
    if (!card) return { path: new Set(), destination: null };

    const focusedMarble = this.hoveredMarble() ?? this.gameStateService.selectedMarblePosition();
    if (focusedMarble === null) return { path: new Set(), destination: null };

    const data = this.gameStateService.data();
    const myColor = this.gameStateService.myPlayerColor();
    if (!data || !myColor) return { path: new Set(), destination: null };

    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return { path: new Set(), destination: null };

    const marblesByColor = Object.fromEntries(
      data.gameState.players.map(p => [p.color, p.marblePositions])
    ) as Record<MarbleColor, number[]>;
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
      marblesByColor,
    };

    let action: Action | null = null;

    if (card.value === '7') {
      const steps1 = this.gameStateService.sevenFirstSteps();
      const marble1 = this.gameStateService.selectedMarblePosition();
      if (steps1 < 7 && marble1 !== null) {
        const marble2 = this.gameStateService.selectedSplit7MarblePosition();
        const dummyCard = { id: '__preview__', value: '7' as const, suit: '♠' as const };
        if (marble2 !== null) {
          // Both marbles selected: show both paths simultaneously
          const action1 = getActionForSteps(dummyCard, marble1, steps1, ctx);
          const action2 = getActionForSteps(dummyCard, marble2, 7 - steps1, ctx);
          const preview1 = action1 ? this.computePreviewFromAction(action1) : { path: new Set<number>(), destination: null };
          const preview2 = action2 ? this.computePreviewFromAction(action2) : { path: new Set<number>(), destination: null };
          const combinedPath = new Set([...preview1.path, ...preview2.path]);
          if (preview1.destination !== null) combinedPath.add(preview1.destination);
          return { path: combinedPath, destination: preview2.destination };
        }
        // Only first marble selected: always show marble1's path
        const action1 = getActionForSteps(dummyCard, marble1, steps1, ctx);
        const preview1 = action1
          ? this.computePreviewFromAction(action1)
          : { path: new Set<number>(), destination: null };

        // If hovering over a candidate second marble, also show its preview
        if (focusedMarble !== null && focusedMarble !== marble1) {
          const action2 = getActionForSteps(dummyCard, focusedMarble, 7 - steps1, ctx);
          if (action2) {
            const preview2 = this.computePreviewFromAction(action2);
            const combinedPath = new Set([...preview1.path, ...preview2.path]);
            if (preview1.destination !== null) combinedPath.add(preview1.destination);
            return { path: combinedPath, destination: preview2.destination };
          }
        }

        return { path: preview1.path, destination: preview1.destination };
      } else {
        action = getLegalAction(card, focusedMarble, ctx);
      }
    } else if (card.value === 'J') {
      return { path: new Set(), destination: null };
    } else {
      action = getLegalAction(card, focusedMarble, ctx);
    }

    if (!action) return { path: new Set(), destination: null };
    return this.computePreviewFromAction(action);
  });

  debug = false;

  // ── Timers internes ─────────────────────────────────────────────────────────
  private flyingCardTimeout: ReturnType<typeof setTimeout> | null = null;

  private actionPlayedSub: Subscription | null = null;


  constructor(protected gameStateService: GameStateService, private soundService: SoundService) {

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

          this.soundService.playCard();
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
      this.soundService.playCard();
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

    const applyAndWait = (index: number, anim: SquareAnimation, overrideDuration?: number) => {
      const d = overrideDuration ?? duration;
      return new Promise<void>(res => {
        this.squareAnimations.update(prev => ({ ...prev, [index]: anim }));
        setTimeout(() => {
          this.squareAnimations.update(prev => {
            const next = { ...prev };
            delete next[index];
            return next;
          });
          res();
        }, d);
      });
    };

    const animateSingleMove = async (a: Action) => {
      const t = a.type as ActionType;
      if (t === 'move') {
        for (const step of this.calculateActionsMove(a)) {
          this.soundService.playMove();
          this.updateMarblePosition(step);
          await applyAndWait(step.to, { marbleClass: 'marble-moving' }, MARBLE_ANIMATION_DURATIONS.move);
        }
      } else if (t === 'capture') {
        const captureSteps = this.calculateActionsMove(a);
        for (let i = 0; i < captureSteps.length - 1; i++) {
          const step = captureSteps[i]!;
          this.soundService.playMove();
          this.updateMarblePosition(step);
          await applyAndWait(step.to, { marbleClass: 'marble-moving' }, MARBLE_ANIMATION_DURATIONS.move);
        }
        const finalStep = captureSteps[captureSteps.length - 1]!;
        this.soundService.playCapture();
        this.updateMarblePosition(finalStep);
        await Promise.all([
          applyAndWait(finalStep.from, { marbleClass: 'marble-capturing' }),
          applyAndWait(finalStep.to, { marbleClass: 'marble-captured-exit', squareClass: 'square-impact' }),
        ]);
      } else if (t === 'promote') {
        const startPos = START_POSITIONS[a.playerColor as MarbleColor];
        const startPosIndex = MAIN_PATH.indexOf(startPos);
        const beforeStartPos = MAIN_PATH[(startPosIndex - 1 + MAIN_PATH.length) % MAIN_PATH.length];
        const mainPathAction: Action = { ...a, type: 'move', to: beforeStartPos };
        for (const step of this.calculateActionsMove(mainPathAction)) {
          this.soundService.playMove();
          this.updateMarblePosition(step);
          await applyAndWait(step.to, { marbleClass: 'marble-moving' }, MARBLE_ANIMATION_DURATIONS.move);
        }
        this.soundService.playPromote();
        this.updateMarblePosition({ ...a, from: beforeStartPos });
        await applyAndWait(a.to, { marbleClass: 'marble-promoting', squareClass: 'square-promoting' });
      }
    };

    switch (type) {
      case 'enter': {
        const enemyColor = this.getMarbleOnSquare(action.to);
        const isCapture = enemyColor !== null && enemyColor !== action.playerColor;

        this.soundService.playEnter();
        if (isCapture) {
          // Phase 1: enemy marble is still at action.to — eject it + shockwave on square
          await applyAndWait(action.to, { marbleClass: 'marble-ejected', squareClass: 'square-enter-impact' }, MARBLE_EJECTED_DURATION_MS);
          // Remove the captured enemy from the display so the square is empty before the new marble enters
          this.removeMarbleFromSquare(action.to, enemyColor);
          // Phase 2: entering marble drops into the now-empty square
          this.updateMarblePosition(action);
          await applyAndWait(action.to, { marbleClass: 'marble-entering' }, MARBLE_ANIMATION_DURATIONS.enter);
          // Phase 3: impact squash on landing
          await applyAndWait(action.to, { marbleClass: 'marble-enter-impact' }, ENTER_IMPACT_DURATION_MS);
        } else {
          this.updateMarblePosition(action);
          await applyAndWait(action.to, { marbleClass: 'marble-entering' });
        }
        break;
      }

      case 'move':
      case 'capture':
      case 'promote':
        // Animer le premier pion
        await animateSingleMove(action);
        // Split du 7 : animer aussi le second pion
        if (action.splitFrom !== undefined && action.splitTo !== undefined) {
          const splitAction: Action = {
            ...action,
            type: action.splitType ?? 'move',
            from: action.splitFrom,
            to: action.splitTo,
            splitFrom: undefined,
            splitTo: undefined,
            splitType: undefined,
          };
          await animateSingleMove(splitAction);
        }
        break;

      case 'swap': {
        this.soundService.playSwap();
        const targetColor = this.displayedGameData()?.gameState.players.find(
          p => p.color !== action.playerColor && (p.marblePositions ?? []).includes(action.to)
        )?.color;
        this.updateMarblePosition(action);
        if (targetColor) {
          this.updateMarblePosition({ ...action, playerColor: targetColor, from: action.to, to: action.from });
        }
        await Promise.all([
          applyAndWait(action.to, { marbleClass: 'marble-swapping' }),
          applyAndWait(action.from, { marbleClass: 'marble-swapping' }),
        ]);
        break;
      }

      case 'discard':
      case 'pass':
        this.soundService.playDiscard();
        this.updateMarblePosition(action);
        break;

      default:
        this.updateMarblePosition(action);
    }
  }

  // ── Preview helpers ─────────────────────────────────────────────────────────

  private computePreviewFromAction(action: Action): { path: Set<number>; destination: number | null } {
    if (action.type === 'enter') {
      return { path: new Set(), destination: action.to };
    }

    if (action.type === 'promote') {
      const startPos = START_POSITIONS[action.playerColor as MarbleColor];
      const startPosIndex = MAIN_PATH.indexOf(startPos);
      const beforeStartPos = MAIN_PATH[(startPosIndex - 1 + MAIN_PATH.length) % MAIN_PATH.length];
      const squares = this.getMainPathSquaresBetween(action.from, beforeStartPos);
      const path = new Set(squares.slice(1)); // exclude starting square, include beforeStartPos
      return { path, destination: action.to };
    }

    // move / capture — intermediate squares on MAIN_PATH, excluding from and to
    const squares = this.getMainPathSquaresBetween(action.from, action.to);
    const path = new Set(squares.slice(1, -1));
    return { path, destination: action.to };
  }

  private getMainPathSquaresBetween(from: number, to: number): number[] {
    const startIndex = MAIN_PATH.indexOf(from);
    const endIndex = MAIN_PATH.indexOf(to);
    if (startIndex === -1 || endIndex === -1) return [];

    const forwardDist = (endIndex - startIndex + MAIN_PATH.length) % MAIN_PATH.length;
    const backwardDist = (startIndex - endIndex + MAIN_PATH.length) % MAIN_PATH.length;
    const goBackward = backwardDist < forwardDist;

    const path: number[] = [];
    let currentIndex = startIndex;
    while (currentIndex !== endIndex) {
      path.push(MAIN_PATH[currentIndex]!);
      currentIndex = goBackward
        ? (currentIndex - 1 + MAIN_PATH.length) % MAIN_PATH.length
        : (currentIndex + 1) % MAIN_PATH.length;
    }
    path.push(MAIN_PATH[endIndex]!);
    return path;
  }

  isPreviewPath(index: number): boolean {
    return this.previewInfo().path.has(index);
  }

  isPreviewDestination(index: number): boolean {
    return this.previewInfo().destination === index;
  }

  onMarbleMouseEnter(index: number): void {
    if (!this.gameStateService.isMyTurn() || !this.gameStateService.selectedCard()) return;

    const card = this.gameStateService.selectedCard();
    const isJackPhase2 = card?.value === 'J' && this.gameStateService.selectedMarblePosition() !== null;

    if (!isJackPhase2) {
      const data = this.gameStateService.data();
      const myColor = this.gameStateService.myPlayerColor();
      const player = data?.gameState.players.find(p => p.color === myColor);
      if (!player?.marblePositions.includes(index)) return;
    }

    this.hoveredMarble.set(index);
  }

  onMarbleMouseLeave(index: number): void {
    if (this.hoveredMarble() === index) this.hoveredMarble.set(null);
  }

  private calculateActionsMove(action: Action): Action[] {
    const startIndex = MAIN_PATH.indexOf(action.from);
    const endIndex = MAIN_PATH.indexOf(action.to);

    if (startIndex === -1 || endIndex === -1) return [];

    const forwardDist = (endIndex - startIndex + MAIN_PATH.length) % MAIN_PATH.length;
    const backwardDist = (startIndex - endIndex + MAIN_PATH.length) % MAIN_PATH.length;
    const goBackward = backwardDist < forwardDist;

    const path: number[] = [];
    let currentIndex = startIndex;

    while (currentIndex !== endIndex) {
      path.push(MAIN_PATH[currentIndex]);
      currentIndex = goBackward
        ? (currentIndex - 1 + MAIN_PATH.length) % MAIN_PATH.length
        : (currentIndex + 1) % MAIN_PATH.length;
    }
    path.push(MAIN_PATH[endIndex]);

    const actions: Action[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      actions.push({
        ...action,
        from: path[i],
        to: path[i + 1],
        type: 'move'
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

  /** Remove a marble of the given color from a specific board square (sets its position to 0). */
  private removeMarbleFromSquare(position: number, color: MarbleColor): void {
    this.displayedGameData.update(current => {
      if (!current) return current;
      const updatedPlayers = current.gameState.players.map(p => {
        if (p.color === color) {
          const marblePositions = p.marblePositions.map(pos => pos === position ? 0 : pos);
          return { ...p, marblePositions };
        }
        return p;
      });
      return { ...current, gameState: { ...current.gameState, players: updatedPlayers } };
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
    root.style.setProperty('--anim-enter-impact', `${ENTER_IMPACT_DURATION_MS}ms`);
    root.style.setProperty('--anim-marble-ejected', `${MARBLE_EJECTED_DURATION_MS}ms`);
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

  getDisplayName(player: Player | undefined): string {
    if (!player) return 'En attente';
    const name = player.name;
    const spaceIndex = name.indexOf(' ');
    const firstName = spaceIndex === -1 ? name : name.slice(0, spaceIndex);
    const lastName = spaceIndex === -1 ? name : name.slice(name.lastIndexOf(' ') + 1);
    if (firstName.length <= 8) return firstName;
    if (lastName.length <= 8) return lastName;
    return firstName.slice(0, 8);
  }

  getArrivalNumber(index: number): number | null {
    for (const positions of Object.values(this.arrivals)) {
      const pos = positions.indexOf(index);
      if (pos !== -1) return 4 - pos;
    }
    return null;
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

  /** Vrai si une carte est sélectionnée (pour assombrir le board). */
  isCardSelected(): boolean {
    return this.gameStateService.isMyTurn() && this.gameStateService.selectedCard() !== null;
  }

  /** Vrai si ce pion appartient au joueur local (pour le faire passer au-dessus de l'overlay). */
  isMyMarble(index: number): boolean {
    return this.getMarbleOnSquare(index) === this.gameStateService.myPlayerColor();
  }

  /** Vrai si ce pion peut être sélectionné (uniquement après avoir choisi une carte, et seulement si jouable). */
  isSelectableMarble(index: number): boolean {
    if (!this.gameStateService.isMyTurn()) return false;
    if (!this.gameStateService.selectedCard()) return false;
    const playable = this.gameStateService.playableMarblePositions();
    if (playable !== null) return playable.has(index);
    // When a marble is selected, own playable marbles are still clickable (to switch selection)
    const playableOwn = this.gameStateService.playableOwnMarbles();
    if (playableOwn !== null) return playableOwn.has(index);
    return false;
  }

  isSelectedMarble(index: number): boolean {
    return this.gameStateService.selectedMarblePosition() === index
      || this.gameStateService.selectedSwapTargetPosition() === index
      || this.gameStateService.selectedSplit7MarblePosition() === index;
  }

  /** Marble jouable avec la carte sélectionnée (à mettre en surbrillance). */
  isPlayableMarble(index: number): boolean {
    const playable = this.gameStateService.playableMarblePositions();
    return playable !== null && playable.has(index);
  }

  /** Marble non-jouable avec la carte sélectionnée (à atténuer). */
  isDimmedMarble(index: number): boolean {
    const playable = this.gameStateService.playableOwnMarbles();
    if (playable === null) return false;
    if (this.isSelectedMarble(index)) return false;
    return this.getMarbleOnSquare(index) === this.gameStateService.myPlayerColor() && !playable.has(index);
  }

  onMarbleClick(index: number): void {
    const selected = this.gameStateService.selectedMarblePosition();
    const card = this.gameStateService.selectedCard();

    // Clic sur la bille déjà sélectionnée → désélectionner tout
    if (selected === index) {
      this.gameStateService.selectedMarblePosition.set(null);
      this.gameStateService.selectedSwapTargetPosition.set(null);
      this.gameStateService.selectedSplit7MarblePosition.set(null);
      return;
    }

    // 7 phase 2 : clic sur un second pion candidat
    if (card?.value === '7' && selected !== null && this.gameStateService.sevenFirstSteps() < 7 && this.isSelectableMarble(index)) {
      const currentSplit = this.gameStateService.selectedSplit7MarblePosition();
      this.gameStateService.selectedSplit7MarblePosition.set(currentSplit === index ? null : index);
      return;
    }

    // Clic sur une autre bille propre jouable → changer le premier pion sélectionné
    const playableOwn = this.gameStateService.playableOwnMarbles();
    if (playableOwn !== null && playableOwn.has(index)) {
      this.gameStateService.selectedMarblePosition.set(index);
      this.gameStateService.selectedSwapTargetPosition.set(null);
      this.gameStateService.selectedSplit7MarblePosition.set(null);
      if (card?.value === '7') this.gameStateService.sevenFirstSteps.set(7);
      return;
    }

    // Jack phase 2 : clic sur une bille adverse échangeable → définir la cible
    if (card?.value === 'J' && selected !== null && this.isSelectableMarble(index)) {
      const currentTarget = this.gameStateService.selectedSwapTargetPosition();
      this.gameStateService.selectedSwapTargetPosition.set(currentTarget === index ? null : index);
    }
  }
}