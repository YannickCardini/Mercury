import { ChangeDetectionStrategy, Component, HostListener, OnInit, OnDestroy, signal, computed, effect, inject } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { SoundService } from '../../services/sound.service';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { TockCardComponent } from 'src/app/shared/tock-card.component';
import { PlayerBadgeComponent } from './player-badge.component';
import { Subscription, firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { Capacitor } from '@capacitor/core';

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
  SKIPPED_INDICES,
  MARBLE_ANIMATION_DURATIONS,
  ENTER_CAPTURE_DURATION_MS,
  CAPTURE_VICTIM_END_RATIO,
  ENTER_CAPTURE_VICTIM_END_RATIO,
  JOSTLE_DURATION_MS,
  CARD_LAND_DELAY_MS,
  CARD_FLY_DURATION_MS,
  GameStateMessage,
  MAIN_PATH,
  getPositionAfterMove,
  getLegalAction,
  getActionForSteps,
  type LegalMoveContext,
} from '@mercury/shared';

export interface ProfileData {
  name: string;
  picture: string;
  points: number;
  ranking: number;
  createdAt: string;
}

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
  imports: [IonCol, IonRow, IonGrid, CommonModule, TockCardComponent, PlayerBadgeComponent],
  // `is-native` permet d'alléger en CSS les effets coûteux sur WebView Android
  // (backdrop-filter, etc.) qui provoquent flash blanc et chutes de FPS.
  host: { '[class.is-native]': '!isWeb' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardComponent implements OnInit, OnDestroy {

  // ── Config plateau ──────────────────────────────────────────────────────────
  readonly isWeb = !Capacitor.isNativePlatform();
  readonly gridSize = GRID_SIZE;
  readonly homes = HOME_POSITIONS;
  readonly arrivals = ARRIVAL_POSITIONS;
  readonly starts = START_POSITIONS;
  readonly skippedIndices = SKIPPED_INDICES;

  // ── État UI ─────────────────────────────────────────────────────────────────
  squareSize: number = 0;
  squareToDisplay: number[] = SQUARES_TO_DISPLAY;
  squareAnimations = signal<Record<number, SquareAnimation>>({});
  /**
   * Pions éphémères rendus en plus du pion du modèle sur une case. Indispensable
   * car le board ne rend qu'un pion par case via le modèle : pour faire coexister
   * deux pions sur une même case le temps d'une animation, le second est retiré du
   * modèle et rendu ici. Sert à la victime d'une capture / enter+capture (retirée
   * définitivement) et au pion bousculé lors d'un survol (restauré ensuite).
   */
  overlayMarbles = signal<Record<number, { color: MarbleColor; animClass: string }>>({});
  discardPile = signal<CardInfo[]>([]);
  flyingCard = signal<CardInfo | null>(null);
  /** Cartes en vol simultanées lors d'un discard (plusieurs cartes) */
  flyingCards = signal<Array<CardInfo & { flyIndex: number }>>([]);
  displayedGameData = signal<GameStateMessage | null>(null);

  // ── Preview de mouvement ────────────────────────────────────────────────────
  /** Position de la bille survolée (pour la preview de trajet). */
  hoveredMarble = signal<number | null>(null);

  /** Squares à mettre en évidence : chemin intermédiaire + destination. */
  previewInfo = computed<{ path: Set<number>; pathMarble2: Set<number>; destination: number | null }>(() => {
    const empty = { path: new Set<number>(), pathMarble2: new Set<number>(), destination: null };
    if (!this.gameStateService.isMyTurn()) return empty;

    const card = this.gameStateService.selectedCard();
    if (!card) return empty;

    const focusedMarble = this.hoveredMarble() ?? this.gameStateService.selectedMarblePosition();
    if (focusedMarble === null) return empty;

    const data = this.gameStateService.data();
    const myColor = this.gameStateService.myPlayerColor();
    if (!data || !myColor) return empty;

    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return empty;

    const marblesByColor = Object.fromEntries(
      data.gameState.players.map(p => [p.color, p.marblePositions])
    ) as Record<MarbleColor, number[]>;
    const invincibleMarblesByColor = Object.fromEntries(
      data.gameState.players.map(p => [p.color, p.marblePositions.filter((_, i) => p.marbleInvincible[i])])
    ) as Record<MarbleColor, number[]>;
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
      marblesByColor,
      invincibleMarblesByColor,
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
          const path1 = new Set(preview1.path);
          if (preview1.destination !== null) path1.add(preview1.destination);
          return { path: path1, pathMarble2: preview2.path, destination: preview2.destination };
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
            const path1 = new Set(preview1.path);
            if (preview1.destination !== null) path1.add(preview1.destination);
            return { path: path1, pathMarble2: preview2.path, destination: preview2.destination };
          }
        }

        return { path: preview1.path, pathMarble2: new Set(), destination: preview1.destination };
      } else {
        action = getLegalAction(card, focusedMarble, ctx);
      }
    } else if (card.value === 'J') {
      return empty;
    } else {
      action = getLegalAction(card, focusedMarble, ctx);
    }

    if (!action) return empty;
    const preview = this.computePreviewFromAction(action);
    return { path: preview.path, pathMarble2: new Set(), destination: preview.destination };
  });

  /**
   * Map de la couleur du pion sur chaque case, recalculée uniquement quand l'état
   * affiché change. Évite `players.find` + `marblePositions.includes` par case
   * appelés à chaque détection de changement (très coûteux sur mobile).
   */
  private marbleByPosition = computed<Map<number, MarbleColor>>(() => {
    const m = new Map<number, MarbleColor>();
    const gameData = this.displayedGameData();
    if (!gameData || !this.gameStateService.isConnected()) return m;
    for (const player of gameData.gameState.players) {
      const color = player.color as MarbleColor;
      const positions = player.marblePositions ?? [];
      for (const pos of positions) {
        if (pos !== 0) m.set(pos, color);
      }
    }
    return m;
  });

  /** Cache statique des classes de case (dépend uniquement de l'index). */
  private squareClassCache = new Map<number, string>();

  readonly debug = environment.debug;

  // ── Profile panel (API) ──────────────────────────────────────────────────────
  private http = inject(HttpClient);
  private router = inject(Router);

  // ── Timers internes ─────────────────────────────────────────────────────────
  private flyingCardTimeout: ReturnType<typeof setTimeout> | null = null;

  private actionPlayedSub: Subscription | null = null;


  constructor(protected gameStateService: GameStateService, private soundService: SoundService) {

    effect(() => {
      this.displayedGameData.set(this.gameStateService.data());
    });

    // Récupère (une seule fois par joueur identifié) le rang affiché sur la pastille.
    // Les bots et invités n'ont pas de userId → pas de rang, badge masqué.
    effect(() => {
      const data = this.gameStateService.data();
      if (!data) return;
      for (const p of data.gameState.players) {
        if (!p.userId || this.fetchedRankingUserIds.has(p.userId)) continue;
        this.fetchedRankingUserIds.add(p.userId);
        const color = p.color;
        this.fetchPlayerProfile(p.userId).then(profile => {
          if (profile && typeof profile.ranking === 'number') {
            this.playerRankings.update(r => ({ ...r, [color]: profile.ranking }));
          }
        });
      }
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
        await this.hopThrough(this.calculateActionsMove(a));
      } else if (t === 'capture') {
        const captureSteps = this.calculateActionsMove(a);
        // Sauts intermédiaires (avec réaction des pions survolés), puis impact.
        await this.hopThrough(captureSteps.slice(0, -1));
        const finalStep = captureSteps[captureSteps.length - 1]!;
        this.soundService.playCapture();
        // Retire la victime du modèle puis y amène l'attaquant : la case ne rend
        // alors plus que l'attaquant (marble-capturing), la victime étant rendue
        // en overlay (marble-captured-exit), déclenchée pile au contact par le CSS.
        const onSquare = this.getMarbleOnSquare(finalStep.to);
        const victimColor = onSquare && onSquare !== a.playerColor ? onSquare : null;
        if (victimColor) {
          this.removeMarbleFromSquare(finalStep.to, victimColor);
        }
        this.updateMarblePosition(finalStep);
        await this.playCaptureImpact(finalStep.to, victimColor, 'capture');
      } else if (t === 'promote') {
        const startPos = START_POSITIONS[a.playerColor as MarbleColor];
        const startPosIndex = MAIN_PATH.indexOf(startPos);
        const beforeStartPos = MAIN_PATH[(startPosIndex - 1 + MAIN_PATH.length) % MAIN_PATH.length];
        const mainPathAction: Action = { ...a, type: 'move', to: beforeStartPos };
        await this.hopThrough(this.calculateActionsMove(mainPathAction));
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
          // Chute droite de l'attaquant sur l'ennemi : on retire la victime du
          // modèle, on pose l'attaquant, puis le CSS écrabouille la victime
          // (overlay) pile au contact — aucun timing JS.
          this.removeMarbleFromSquare(action.to, enemyColor!);
          this.updateMarblePosition(action);
          await this.playCaptureImpact(action.to, enemyColor, 'enter');
        } else {
          this.updateMarblePosition(action);
          await applyAndWait(action.to, { marbleClass: 'marble-entering', squareClass: 'square-enter-impact' });
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
          applyAndWait(action.to, { marbleClass: 'marble-swapping', squareClass: 'square-swapping' }),
          applyAndWait(action.from, { marbleClass: 'marble-swapping', squareClass: 'square-swapping' }),
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

  /**
   * Pose une animation de case (et son éventuelle classe de pion) pendant `duration`,
   * puis la retire. Une seule animation à la fois par case.
   */
  private applySquareAnim(index: number, anim: SquareAnimation, duration: number): Promise<void> {
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
  }

  /**
   * Fait sauter le pion case par case le long du trajet. Si une case du trajet est
   * occupée par un autre pion (survol sans capture), ce pion est retiré du modèle,
   * rendu en overlay avec une réaction `marble-jostled` (le sauteur lui retombe
   * dessus), puis restauré une fois la réaction terminée — le sauteur l'a alors déjà
   * quittée, donc aucun conflit « deux pions sur une case ».
   */
  private async hopThrough(steps: Action[]): Promise<void> {
    for (const step of steps) {
      this.soundService.playMove();
      const occupant = this.getMarbleOnSquare(step.to);
      if (occupant) {
        const square = step.to;
        this.removeMarbleFromSquare(square, occupant);
        this.overlayMarbles.update(prev => ({ ...prev, [square]: { color: occupant, animClass: 'marble-jostled' } }));
        setTimeout(() => {
          this.overlayMarbles.update(prev => {
            const next = { ...prev };
            delete next[square];
            return next;
          });
          // Ne réintègre que si notre retrait optimiste tient toujours (case vide).
          // Si l'état autoritaire du serveur est déjà arrivé, le pion y est déjà :
          // ne rien ajouter, sous peine d'y téléporter un pion resté à la maison.
          if (this.getMarbleOnSquare(square) === null) {
            this.restoreMarbleToSquare(square, occupant);
          }
        }, JOSTLE_DURATION_MS);
      }
      this.updateMarblePosition(step);
      await this.applySquareAnim(step.to, { marbleClass: 'marble-moving' }, MARBLE_ANIMATION_DURATIONS.move);
    }
  }

  /**
   * Pose les classes d'impact (attaquant + case + victime overlay) en une fois et
   * laisse le CSS gérer la synchro (la victime réagit pile au contact via son
   * `animation-delay`). Nettoie tout une fois l'animation de la victime terminée.
   */
  private playCaptureImpact(
    index: number,
    victimColor: MarbleColor | null,
    kind: 'capture' | 'enter',
  ): Promise<void> {
    const isEnter = kind === 'enter';
    const attackerClass = isEnter ? 'marble-enter-slam' : 'marble-capturing';
    const victimClass = isEnter ? 'marble-crushed' : 'marble-captured-exit';
    const squareClass = isEnter ? 'square-enter-impact-capture' : 'square-impact';
    const base = isEnter ? ENTER_CAPTURE_DURATION_MS : MARBLE_ANIMATION_DURATIONS.capture;
    const ratio = isEnter ? ENTER_CAPTURE_VICTIM_END_RATIO : CAPTURE_VICTIM_END_RATIO;

    return new Promise<void>(res => {
      this.squareAnimations.update(prev => ({ ...prev, [index]: { marbleClass: attackerClass, squareClass } }));
      if (victimColor) {
        this.overlayMarbles.update(prev => ({ ...prev, [index]: { color: victimColor, animClass: victimClass } }));
      }
      setTimeout(() => {
        this.squareAnimations.update(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        if (victimColor) {
          this.overlayMarbles.update(prev => {
            const next = { ...prev };
            delete next[index];
            return next;
          });
        }
        res();
      }, Math.round(base * ratio));
    });
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

  isPreviewPathMarble2(index: number): boolean {
    return this.previewInfo().pathMarble2.has(index);
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

  /**
   * Réintègre un pion d'une couleur au modèle sur une case donnée (inverse de
   * removeMarbleFromSquare). On réutilise n'importe quel pion de cette couleur
   * actuellement hors-jeu (position 0) : le rendu ne dépend que de la couleur et de
   * la position, et l'état autoritaire du serveur recale tout à la fin du tour.
   */
  private restoreMarbleToSquare(position: number, color: MarbleColor): void {
    this.displayedGameData.update(current => {
      if (!current) return current;
      const updatedPlayers = current.gameState.players.map(p => {
        if (p.color === color) {
          const marblePositions = [...p.marblePositions];
          const idx = marblePositions.indexOf(0);
          if (idx !== -1) marblePositions[idx] = position;
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

  getOverlayMarble(index: number): { color: MarbleColor; animClass: string } | null {
    return this.overlayMarbles()[index] ?? null;
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
    root.style.setProperty('--anim-enter-capture', `${ENTER_CAPTURE_DURATION_MS}ms`);
    root.style.setProperty('--anim-jostle', `${JOSTLE_DURATION_MS}ms`);
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
    const cached = this.squareClassCache.get(index);
    if (cached !== undefined) return cached;

    let result: string;
    if (!this.squareToDisplay.includes(index)) {
      result = 'case-hidden';
    } else {
      result = 'case-path normal';
      for (const [color, pos] of Object.entries(this.starts)) {
        if (pos === index) { result = `case-path start start-${color}`; break; }
      }
      if (result === 'case-path normal') {
        for (const [color, positions] of Object.entries(this.homes)) {
          if ((positions as number[]).includes(index)) { result = `case-path home home-${color}`; break; }
        }
      }
      if (result === 'case-path normal') {
        for (const [color, positions] of Object.entries(this.arrivals)) {
          if ((positions as number[]).includes(index)) { result = `case-path arrival arrival-${color}`; break; }
        }
      }
    }
    this.squareClassCache.set(index, result);
    return result;
  }

  getPlayer(color: MarbleColor): Player | undefined {
    return this.displayedGameData()?.gameState.players.find(p => p.color === color);
  }

  /**
   * Sièges des pastilles joueur, mappés sur le coin physique de chaque couleur
   * (cf. HOME_POSITIONS / PLAYER_INFO_STARTS après la reconfiguration du plateau).
   */
  readonly cornerSlots: ReadonlyArray<{ color: MarbleColor; corner: 'tl' | 'tr' | 'bl' | 'br' }> = [
    { color: 'orange', corner: 'tl' },
    { color: 'red', corner: 'tr' },
    { color: 'blue', corner: 'bl' },
    { color: 'green', corner: 'br' },
  ];

  /** Rang au classement par couleur, alimenté à la demande via l'API profil. */
  playerRankings = signal<Partial<Record<MarbleColor, number>>>({});
  private fetchedRankingUserIds = new Set<string>();

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
    return this.marbleByPosition().get(index) ?? null;
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

  /** Vrai si ce pion est le second pion choisi pour un split de 7 (halo doré distinct). */
  isSplit7SecondMarble(index: number): boolean {
    return this.gameStateService.selectedSplit7MarblePosition() === index;
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
    // Un pion actuellement sélectionnable (ex. second pion valide d'un split 7
    // qui ne peut pas initier un coup seul) ne doit jamais être grisé.
    if (this.isSelectableMarble(index)) return false;
    // Tout pion non sélectionnable est atténué — y compris les pions adverses.
    return this.getMarbleOnSquare(index) !== null;
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

  // ── Profile panel (API) ───────────────────────────────────────────────────

  async fetchPlayerProfile(userId: string): Promise<ProfileData | null> {
    try {
      return await firstValueFrom(
        this.http.get<ProfileData>(`${environment.apiUrl}/api/auth/user/${userId}`)
      );
    } catch {
      return null;
    }
  }

  computeMemberSince(createdAt: string): string {
    const created = new Date(createdAt);
    const now = new Date();
    const months =
      (now.getFullYear() - created.getFullYear()) * 12 +
      (now.getMonth() - created.getMonth());
    if (months < 1) return 'Member for less than a month';
    if (months < 12) return `Member for ${months} month${months > 1 ? 's' : ''}`;
    const years = Math.floor(months / 12);
    return `Member for ${years} year${years > 1 ? 's' : ''}`;
  }

  goToLeaderboard(): void {
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/leaderboard'])
    );
    window.open(url, '_blank');
  }

  viewProfile(userId: string | null): void {
    if (!userId) return;
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/profile', userId])
    );
    window.open(url, '_blank');
  }
}