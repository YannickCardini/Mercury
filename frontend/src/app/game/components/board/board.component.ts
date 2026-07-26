import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, Output, EventEmitter, afterNextRender, signal, computed, effect, inject } from '@angular/core';
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
  ENTER_IMPACT_DURATION_MS,
  MARBLE_EJECTED_DURATION_MS,
  CARD_LAND_DELAY_MS,
  CARD_FLY_DURATION_MS,
  GameStateMessage,
  MAIN_PATH,
  getPositionAfterMove,
  getLegalAction,
  getActionForSteps,
  buildMoveActionForMarble,
  getTeammateColor,
  ENTER_CARDS,
} from '@mercury/shared';

/**
 * Durée de la réaction « jostle » d'un pion qu'un autre survole en passant (ms).
 * Volontairement locale au composant : purement cosmétique et jouée EN PARALLÈLE
 * du saut, sans incidence sur le rythme serveur (computeMinAnimationDuration) —
 * inutile de la partager. Doit correspondre au keyframe `pawnJostle` (--anim-jostle).
 */
const JOSTLE_DURATION_MS = 380;

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
  // `is-native` : permet d'alléger en CSS les effets coûteux/flashants sur WebView
  // Android (filtres SVG sur l'anneau-timer des badges).
  host: { '[class.is-native]': '!isWeb' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardComponent implements OnDestroy {

  // ── Config plateau ──────────────────────────────────────────────────────────
  readonly isWeb = !Capacitor.isNativePlatform();
  readonly gridSize = GRID_SIZE;
  readonly homes = HOME_POSITIONS;
  readonly arrivals = ARRIVAL_POSITIONS;
  readonly starts = START_POSITIONS;
  readonly skippedIndices = SKIPPED_INDICES;

  // ── État UI ─────────────────────────────────────────────────────────────────
  squareSize = signal(0);
  @Output() ready = new EventEmitter<void>();
  private _readyEmitted = false;
  squareToDisplay: number[] = SQUARES_TO_DISPLAY;
  squareAnimations = signal<Record<number, SquareAnimation>>({});
  /**
   * Pions éphémères rendus EN PLUS du pion du modèle sur une même case, le temps
   * d'une réaction. Sert au « jostle » : un pion survolé par un sauteur est sorti
   * du modèle et rendu ici avec `marble-jostled`, puis réintégré une fois la
   * réaction terminée (évite deux pions sur la même case).
   */
  overlayMarbles = signal<Record<number, { color: MarbleColor; animClass: string }>>({});
  discardPile = signal<CardInfo[]>([]);
  flyingCard = signal<CardInfo | null>(null);
  /** Cartes en vol simultanées lors d'un discard (plusieurs cartes) */
  flyingCards = signal<Array<CardInfo & { flyIndex: number }>>([]);
  displayedGameData = signal<GameStateMessage | null>(null);

  /**
   * Bannière one-shot (2v2) affichée quand un joueur vient de rentrer son 4e
   * pion et bascule sur les pions de son coéquipier. `null` = pas affichée.
   */
  finishCelebration = signal<{ color: MarbleColor; name: string; teammateName: string } | null>(null);
  private finishCelebrationTimeout: ReturnType<typeof setTimeout> | null = null;
  private static readonly FINISH_CELEBRATION_DURATION_MS = 2600;

  /**
   * Cases d'arrivée dont la bille joue la séquence de verrouillage (2v2) :
   * clac de blindage + étoiles de capture. One-shot — l'état persistant qui
   * suit est `marble-anchored` (dérivé de `finishedColors`).
   */
  lockingSquares = signal<ReadonlySet<number>>(new Set());
  private lockTimeouts: ReturnType<typeof setTimeout>[] = [];
  /** Durée totale des keyframes `marbleLockIn` — doit rester alignée au SCSS. */
  private static readonly LOCK_TOTAL_MS = 900;

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

    const ctx = this.gameStateService.legalCtx();
    if (!ctx) return empty;

    // Mise en jeu solidaire (2v2) : preview de l'entrée du pion du coéquipier.
    const solidaire = this.gameStateService.forcedSolidaireEntry();
    if (solidaire) {
      if (!ENTER_CARDS.includes(card.value)) return empty;
      const teammate = ctx.teammateColor!;
      const isReserve = HOME_POSITIONS[teammate].includes(focusedMarble)
        && ctx.marblesByColor[teammate].includes(focusedMarble);
      return isReserve
        ? { path: new Set<number>(), pathMarble2: new Set<number>(), destination: solidaire.to }
        : empty;
    }

    let action: Action | null = null;

    if (card.value === '7') {
      const steps1 = this.gameStateService.sevenFirstSteps();
      const marble1 = this.gameStateService.selectedMarblePosition();
      if (steps1 < 7 && marble1 !== null) {
        const marble2 = this.gameStateService.selectedSplit7MarblePosition();
        const dummyCard = { id: '__preview__', value: '7' as const, suit: '♠' as const };
        if (marble2 !== null) {
          // Both marbles selected: show both paths simultaneously.
          // `ForMarble` : le second pion peut appartenir au coéquipier (2v2) —
          // son trajet/promotion dépend de SON start et de SES arrivées.
          const action1 = getActionForSteps(dummyCard, marble1, steps1, ctx);
          const action2 = buildMoveActionForMarble(dummyCard, marble2, 7 - steps1, ctx);
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
          const action2 = buildMoveActionForMarble(dummyCard, focusedMarble, 7 - steps1, ctx);
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
    // On garde le dernier état connu même en cas de hoquet réseau : ne PAS
    // dépendre de isConnected() ici, sinon un blip de connexion vide toutes les
    // cases d'un coup (flash de tout le plateau).
    if (!gameData) return m;
    for (const player of gameData.gameState.players) {
      const color = player.color as MarbleColor;
      const positions = player.marblePositions ?? [];
      for (const pos of positions) {
        if (pos !== 0) m.set(pos, color);
      }
    }
    return m;
  });

  /**
   * Cases contenant actuellement un pion invincible (entre son entrée en jeu
   * et son premier déplacement). Dérivé de `marbleInvincible` (aligné 1:1 sur
   * `marblePositions`), propre à la CASE et non au pion : dès que le backend
   * déplace ce pion, `marbleInvincible` repasse à `false` et le halo
   * disparaît avec le state suivant, avant que l'animation de déplacement
   * ne parte — aucune désactivation manuelle nécessaire côté front.
   */
  private invincibleSquares = computed<Set<number>>(() => {
    const s = new Set<number>();
    const gameData = this.displayedGameData();
    if (!gameData) return s;
    for (const player of gameData.gameState.players) {
      const positions = player.marblePositions ?? [];
      const invincible = player.marbleInvincible ?? [];
      positions.forEach((pos, i) => {
        if (pos !== 0 && invincible[i]) s.add(pos);
      });
    }
    return s;
  });

  /** Cache statique des classes de case (dépend uniquement de l'index). */
  private squareClassCache = new Map<number, string>();

  readonly debug = environment.debug;

  // ── Debug : édition du plateau ──────────────────────────────────────────────
  /** Vrai quand le plateau est en mode édition (partie suspendue côté serveur). */
  readonly editMode = this.gameStateService.boardEditMode;
  /** Case du pion « en main » pendant l'édition (null = aucun pion saisi). */
  editSelectedSquare = signal<number | null>(null);

  // ── Profile panel (API) ──────────────────────────────────────────────────────
  private http = inject(HttpClient);
  private router = inject(Router);

  // ── Timers internes ─────────────────────────────────────────────────────────
  private flyingCardTimeout: ReturnType<typeof setTimeout> | null = null;

  private actionPlayedSub: Subscription | null = null;
  private teammateFinishedSub: Subscription | null = null;


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

    this.teammateFinishedSub = this.gameStateService.teammateFinished$.subscribe((color: MarbleColor) => {
      this.triggerFinishCelebration(color);
    });

    afterNextRender(() => {
      this.calculateSquareSize();
      this.injectAnimationDurations();
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
      // Propriétaire du pion animé — peut différer du joueur qui a joué la
      // carte (2v2 : switch de fin de jeu, 7 partagé, Valet libre).
      const owner = (a.marbleColor ?? a.playerColor) as MarbleColor;
      if (t === 'move') {
        for (const step of this.calculateActionsMove(a)) {
          this.soundService.playMove();
          this.jostlePassedMarble(step.to, owner);
          this.updateMarblePosition(step);
          await applyAndWait(step.to, { marbleClass: 'marble-moving' }, MARBLE_ANIMATION_DURATIONS.move);
        }
      } else if (t === 'capture') {
        const captureSteps = this.calculateActionsMove(a);
        for (let i = 0; i < captureSteps.length - 1; i++) {
          const step = captureSteps[i]!;
          this.soundService.playMove();
          this.jostlePassedMarble(step.to, owner);
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
        const startPos = START_POSITIONS[owner];
        const startPosIndex = MAIN_PATH.indexOf(startPos);
        const beforeStartPos = MAIN_PATH[(startPosIndex - 1 + MAIN_PATH.length) % MAIN_PATH.length];
        const mainPathAction: Action = { ...a, type: 'move', to: beforeStartPos };
        for (const step of this.calculateActionsMove(mainPathAction)) {
          this.soundService.playMove();
          this.jostlePassedMarble(step.to, owner);
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
        const owner = (action.marbleColor ?? action.playerColor) as MarbleColor;
        const enemyColor = this.getMarbleOnSquare(action.to);
        const isCapture = enemyColor !== null && enemyColor !== owner;

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
        // Split du 7 : animer aussi le second pion (qui peut appartenir au
        // coéquipier en 2v2 → marbleColor = splitMarbleColor)
        if (action.splitFrom !== undefined && action.splitTo !== undefined) {
          const splitAction: Action = {
            ...action,
            type: action.splitType ?? 'move',
            from: action.splitFrom,
            to: action.splitTo,
            marbleColor: action.splitMarbleColor ?? action.marbleColor ?? action.playerColor,
            splitFrom: undefined,
            splitTo: undefined,
            splitType: undefined,
            splitMarbleColor: undefined,
          };
          await animateSingleMove(splitAction);
        }
        break;

      case 'swap': {
        this.soundService.playSwap();
        // En 2v2 le Valet peut échanger deux pions étrangers : la source est
        // identifiée par marbleColor, la cible par sa position (couleur ≠ source).
        const sourceColor = (action.marbleColor ?? action.playerColor) as MarbleColor;
        const targetColor = this.displayedGameData()?.gameState.players.find(
          p => p.color !== sourceColor && (p.marblePositions ?? []).includes(action.to)
        )?.color;
        this.updateMarblePosition({ ...action, marbleColor: sourceColor });
        if (targetColor) {
          this.updateMarblePosition({ ...action, marbleColor: targetColor, from: action.to, to: action.from });
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
      const startPos = START_POSITIONS[(action.marbleColor ?? action.playerColor) as MarbleColor];
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
      // Survol autorisé sur les pions contrôlés, et sur tout pion actuellement
      // sélectionnable (2v2 : second pion du coéquipier pour le 7, source
      // étrangère pour le Valet, réserve du coéquipier pour la solidaire).
      const ctx = this.gameStateService.legalCtx();
      if (!ctx?.ownMarbles.includes(index) && !this.isSelectableMarble(index)) return;
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
    // Le pion déplacé appartient à `marbleColor` (2v2 : peut différer du
    // joueur qui a joué la carte).
    const owner = action.marbleColor ?? action.playerColor;
    this.displayedGameData.update(current => {
      if (!current) return current;

      // On crée une copie profonde de l'état pour déclencher la mise à jour
      const updatedPlayers = current.gameState.players.map(p => {
        if (p.color === owner) {
          // On remplace l'ancienne position par la nouvelle dans le tableau
          const marblePositions = [...p.marblePositions]; // Copie du tableau
          const idx = marblePositions.indexOf(action.from);

          if (idx !== -1 && action.to !== 0) {
            marblePositions[idx] = action.to;
          }

          // Mirroir optimiste de la règle backend (game.ts) : un pion n'est
          // invincible qu'entre son entrée en jeu et son premier déplacement.
          // Sans ça, le halo restait affiché (sur la nouvelle case) pendant
          // toute l'animation de déplacement, le temps que le state serveur
          // arrive en fin de tour — il doit disparaître dès que l'animation
          // de mouvement démarre.
          let marbleInvincible = p.marbleInvincible;
          if (idx !== -1) {
            marbleInvincible = [...p.marbleInvincible];
            marbleInvincible[idx] = action.type === 'enter';
          }

          return { ...p, marblePositions, marbleInvincible }; // Retourne le joueur mis à jour
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

  /** Réintègre un pion (position 0 → `position`) après une réaction de jostle. */
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

  /**
   * Réaction d'un pion survolé par un sauteur. Si la case d'arrivée d'un hop est
   * occupée par un pion adverse (survol SANS capture — la case de capture finale
   * est gérée ailleurs), ce pion se penche (`marble-jostled`) pour laisser passer.
   *
   * Il est sorti du modèle et rendu en overlay le temps de la réaction, puis
   * réintégré : évite d'avoir deux pions sur une même case. L'animation est
   * transform-only et tourne EN PARALLÈLE du saut — elle ne bloque pas la
   * séquence et reste légère sur WebView mobile.
   */
  private jostlePassedMarble(square: number, movingColor: MarbleColor): void {
    const occupant = this.getMarbleOnSquare(square);
    if (!occupant || occupant === movingColor) return;

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
      // ne rien faire, sous peine de dupliquer ou téléporter un pion.
      if (this.getMarbleOnSquare(square) === null) {
        this.restoreMarbleToSquare(square, occupant);
      }
    }, JOSTLE_DURATION_MS);
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get topDiscardCard(): CardInfo | null {
    return this.discardPile()[0] ?? null;
  }

  getMarbleAnimClass(index: number): string {
    return this.squareAnimations()[index]?.marbleClass ?? '';
  }

  getOverlayMarble(index: number): { color: MarbleColor; animClass: string } | null {
    return this.overlayMarbles()[index] ?? null;
  }

  getSquareAnimClass(index: number): string {
    return this.squareAnimations()[index]?.squareClass ?? '';
  }

  get rows(): number[] { return Array(this.gridSize).fill(0).map((_, i) => i); }
  get cols(): number[] { return Array(this.gridSize).fill(0).map((_, i) => i); }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.actionPlayedSub?.unsubscribe();
    this.teammateFinishedSub?.unsubscribe();
    if (this.flyingCardTimeout) clearTimeout(this.flyingCardTimeout);
    if (this.finishCelebrationTimeout) clearTimeout(this.finishCelebrationTimeout);
    for (const t of this.lockTimeouts) clearTimeout(t);
  }

  /**
   * Séquence de verrouillage quand un joueur (2v2) vient de rentrer son 4e
   * pion. Appelé UNE FOIS par transition, voir
   * `GameStateService.teammateFinished$` — jamais rejoué sur reconnexion.
   *
   * Façon capture Pokéball : lock.wav part immédiatement, le clac déclenche
   * un glint + de petites étoiles sur les 4 billes de la zone d'arrivée qui
   * s'assombrissent légèrement en se blindant (marble-anchored). La bannière
   * + le carillon arrivent juste après le clac.
   */
  private triggerFinishCelebration(color: MarbleColor): void {
    const squares = this.arrivals[color];
    this.lockingSquares.update(prev => new Set([...prev, ...squares]));
    this.soundService.playLock();

    // +150ms de marge : la classe reste posée un peu après la fin réelle des
    // keyframes (fill-mode forwards) pour éviter tout saut si le timer dévie.
    this.lockTimeouts.push(setTimeout(() => {
      this.lockingSquares.update(prev => {
        const next = new Set(prev);
        for (const s of squares) next.delete(s);
        return next;
      });
    }, BoardComponent.LOCK_TOTAL_MS + 150));

    this.lockTimeouts.push(setTimeout(() => {
      const player = this.getPlayer(color);
      const teammate = this.getPlayer(getTeammateColor(color));
      this.finishCelebration.set({
        // Teinte de la bannière = couleur de représentation du finisseur,
        // c.-à-d. celle du coéquipier pour qui il joue désormais.
        color: this.gameStateService.displayColor(color),
        name: this.getDisplayName(player),
        teammateName: this.getDisplayName(teammate),
      });
      if (this.finishCelebrationTimeout) clearTimeout(this.finishCelebrationTimeout);
      this.finishCelebrationTimeout = setTimeout(() => {
        this.finishCelebration.set(null);
        this.finishCelebrationTimeout = null;
      }, BoardComponent.FINISH_CELEBRATION_DURATION_MS);
    }, 400));
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
    const size = containerSize / this.gridSize;
    this.squareSize.set(size);
    this.gameStateService.boardContainerSize.set(this.calculateTableWrapperSize(containerSize));
    if (!this._readyEmitted && size > 0) {
      this._readyEmitted = true;
      this.ready.emit();
    }
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
   * En 2v2, la forme distingue les équipes : rouge/bleu en losange, orange/vert
   * en cercle. En 1v3 (chacun pour soi), tous les badges sont circulaires.
   */
  readonly cornerSlots = computed<ReadonlyArray<{
    color: MarbleColor;
    corner: 'tl' | 'tr' | 'bl' | 'br';
    shape: 'circle' | 'diamond';
  }>>(() => {
    const teamMode = this.gameStateService.gameMode() === '2v2';
    return [
      { color: 'orange', corner: 'tl', shape: 'circle' },
      { color: 'red', corner: 'tr', shape: teamMode ? 'diamond' : 'circle' },
      { color: 'blue', corner: 'bl', shape: teamMode ? 'diamond' : 'circle' },
      { color: 'green', corner: 'br', shape: 'circle' },
    ];
  });

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

  // ── Debug : édition du plateau ──────────────────────────────────────────────

  /**
   * Suspend la partie côté serveur et passe le plateau en mode édition : tout
   * pion devient saisissable (clic pion → clic case de destination). L'édition
   * ne modifie que la copie locale `displayedGameData` — l'état ne devient
   * autoritaire qu'à la reprise (exitEditMode).
   */
  enterEditMode(): void {
    if (!this.debug || this.editMode() || !this.displayedGameData()) return;
    this.gameStateService.sendDebugPause();
    // Une sélection de carte/pion en cours n'a plus de sens pendant l'édition.
    this.gameStateService.selectedCard.set(null);
    this.gameStateService.selectedMarblePosition.set(null);
    this.gameStateService.selectedSwapTargetPosition.set(null);
    this.gameStateService.selectedSplit7MarblePosition.set(null);
    this.editSelectedSquare.set(null);
    this.gameStateService.boardEditMode.set(true);
  }

  /**
   * Envoie l'état édité au serveur (qui l'applique comme nouvel état
   * autoritaire) et reprend la partie. Si le serveur rejette l'état, la partie
   * reste en pause et un toast s'affiche (actionRejected) — recliquer ✏️
   * permet de corriger puis de retenter.
   */
  exitEditMode(): void {
    if (!this.editMode()) return;
    const data = this.displayedGameData();
    if (!data) return;
    const positions = Object.fromEntries(
      data.gameState.players.map(p => [p.color, [...p.marblePositions]])
    ) as Record<MarbleColor, number[]>;
    // Un pion à 0 est un transitoire d'animation (jostle/capture) : on ne peut
    // pas en faire un état autoritaire. Très improbable pendant une pause.
    if (Object.values(positions).some(list => list.includes(0))) {
      console.warn('🛠️ Édition : une animation est encore en cours, réessayez dans un instant');
      return;
    }
    this.gameStateService.sendDebugResume(positions);
    this.editSelectedSquare.set(null);
    this.gameStateService.boardEditMode.set(false);
  }

  /**
   * Clic sur une case en mode édition. Les clics sur pion arrivent aussi ici
   * (bulle depuis le div du pion) : premier clic = saisir le pion, second =
   * le déposer sur une case libre (ou changer de pion si la case est occupée).
   */
  onSquareClick(index: number): void {
    if (!this.editMode()) return;
    if (!this.squareToDisplay.includes(index)) return;

    const selected = this.editSelectedSquare();
    const occupant = this.getMarbleOnSquare(index);

    if (selected === null || occupant !== null) {
      // Saisir un pion (ou re-cliquer le pion saisi pour le reposer).
      this.editSelectedSquare.set(selected === index ? null : (occupant ? index : null));
      return;
    }

    const color = this.getMarbleOnSquare(selected);
    if (color === null) {
      this.editSelectedSquare.set(null);
      return;
    }
    this.updateMarblePosition({
      type: 'move', from: selected, to: index,
      cardPlayed: null, playerColor: color, marbleColor: color,
    });
    this.editSelectedSquare.set(null);
  }

  // ── Interaction humain ────────────────────────────────────────────────────

  /** Vrai si une carte est sélectionnée (pour assombrir le board). */
  isCardSelected(): boolean {
    return this.gameStateService.isMyTurn() && this.gameStateService.selectedCard() !== null;
  }

  /** Vrai si ce pion est contrôlé par le joueur local (pour le faire passer au-dessus de l'overlay). */
  isMyMarble(index: number): boolean {
    return this.getMarbleOnSquare(index) === this.gameStateService.controlledColor();
  }

  /** Vrai si ce pion peut être sélectionné (uniquement après avoir choisi une carte, et seulement si jouable). */
  isSelectableMarble(index: number): boolean {
    if (this.editMode()) return true; // édition debug : tout pion est déplaçable
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
    if (this.editMode()) return this.editSelectedSquare() === index;
    return this.gameStateService.selectedMarblePosition() === index
      || this.gameStateService.selectedSwapTargetPosition() === index
      || this.gameStateService.selectedSplit7MarblePosition() === index;
  }

  /** Vrai si ce pion est le second pion choisi pour un split de 7 (halo doré distinct). */
  isSplit7SecondMarble(index: number): boolean {
    return this.gameStateService.selectedSplit7MarblePosition() === index;
  }

  /**
   * Vrai si ce pion est "ancré" : dans sa zone d'arrivée ET son propriétaire a
   * fini ses 4 pions (2v2). Persistant — dérivé de `finishedColors`, donc
   * correct dès l'affichage après une reconnexion (pas seulement pendant la
   * célébration one-shot).
   */
  isAnchoredMarble(index: number): boolean {
    const color = this.getMarbleOnSquare(index);
    if (!color) return false;
    return this.gameStateService.finishedColors().has(color) && this.arrivals[color].includes(index);
  }

  /** Bille en pleine séquence de verrouillage « Pokéball » (one-shot, 2v2). */
  isLockingMarble(index: number): boolean {
    return this.lockingSquares().has(index);
  }

  /**
   * Vrai si cette case contient un pion invincible : affiche un dôme/bouclier
   * lumineux autour de la case (propre à la case, pas au pion — voir
   * `invincibleSquares`).
   */
  isInvincibleSquare(index: number): boolean {
    return this.invincibleSquares().has(index);
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
    return this.getMarbleOnSquare(index) === this.gameStateService.controlledColor() && !playable.has(index);
  }

  onMarbleClick(index: number): void {
    // Édition debug : le clic bulle jusqu'à la case, gérée par onSquareClick.
    if (this.editMode()) return;

    const selected = this.gameStateService.selectedMarblePosition();
    const card = this.gameStateService.selectedCard();

    // Clic sur la bille déjà sélectionnée → désélectionner tout
    if (selected === index) {
      this.gameStateService.selectedMarblePosition.set(null);
      this.gameStateService.selectedSwapTargetPosition.set(null);
      this.gameStateService.selectedSplit7MarblePosition.set(null);
      return;
    }

    // 7 phase 2 : clic sur un second pion candidat (le sien ou celui du coéquipier en 2v2)
    if (card?.value === '7' && selected !== null && this.gameStateService.sevenFirstSteps() < 7 && this.isSelectableMarble(index)) {
      const currentSplit = this.gameStateService.selectedSplit7MarblePosition();
      this.gameStateService.selectedSplit7MarblePosition.set(currentSplit === index ? null : index);
      return;
    }

    // Jack phase 2 : clic sur une cible échangeable → définir la cible du swap.
    // Testé AVANT le changement de sélection : en 2v2 une cible valide peut
    // aussi être une source valide (tout pion du plateau) — un clic en phase 2
    // doit choisir la cible, pas re-sélectionner une source.
    if (card?.value === 'J' && selected !== null && this.isSelectableMarble(index)) {
      const currentTarget = this.gameStateService.selectedSwapTargetPosition();
      this.gameStateService.selectedSwapTargetPosition.set(currentTarget === index ? null : index);
      return;
    }

    // Clic sur une autre bille jouable → changer le premier pion sélectionné
    const playableOwn = this.gameStateService.playableOwnMarbles();
    if (playableOwn !== null && playableOwn.has(index)) {
      this.gameStateService.selectedMarblePosition.set(index);
      this.gameStateService.selectedSwapTargetPosition.set(null);
      this.gameStateService.selectedSplit7MarblePosition.set(null);
      if (card?.value === '7') this.gameStateService.sevenFirstSteps.set(7);
      return;
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