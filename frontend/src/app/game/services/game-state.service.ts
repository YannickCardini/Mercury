import { Injectable, signal, computed, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { TabLockService } from './tab-lock.service';
import {
  Action,
  Card,
  GameConfig,
  GameStateMessage,
  ActionPlayedMessage,
  ActionRejectedMessage,
  GameEndedMessage,
  GameStatsMessage,
  MatchmakingStatusMessage,
  CustomRoomStatusMessage,
  GameInviteResponseMessage,
  WelcomeMessage,
  AnimationDoneMessage,
  TurnTimeoutMessage,
  PlayActionMessage,
  JoinGameMessage,
  ServerMessage,
  MarbleColor,
  EmojiReactionMessage,
  ReactionBroadcastMessage,
  AlreadyInActiveGameMessage,
  ReactionEmoji,
  getLegalAction,
  getLegalSplit7Action,
  getValidSevenStepsForMarble,
  canMarbleStartSeven,
  getPositionAfterMove,
  getControlledColor,
  getTeammateColor,
  findSolidaireEntry,
  ENTER_CARDS,
  HOME_POSITIONS,
  type GameMode,
  type LegalMoveContext,
} from '@mercury/shared';

@Injectable({
  providedIn: 'root',
})
export class GameStateService {

  boardContainerSize = signal(0);
  timeLeft = signal(0);

  // ── État serveur ──────────────────────────────────────────────────────────
  data = signal<GameStateMessage | null>(null);
  isConnected = signal(false);
  /** Couleur(s) gagnante(s) : une en 1v3, les deux de l'équipe en 2v2. Vide = partie en cours. */
  winners = signal<MarbleColor[]>([]);
  winReason = signal<'win' | 'win_by_default' | null>(null);
  /** Points stats received after game end. null until the server sends gameStats. */
  gameStats = signal<GameStatsMessage | null>(null);

  // ── Identité du joueur local ──────────────────────────────────────────────
  /** Couleur du joueur humain local. null = mode spectateur (4 IA). */
  myPlayerColor = signal<MarbleColor | null>(null);

  /** Guest player ID for reconnection. */
  guestPlayerId = signal<string | null>(null);
  /** Active game ID for reconnection. */
  activeGameId = signal<string | null>(null);

  /**
   * Vrai quand le tour courant est un REJEU déclenché par un Joker (le même
   * joueur rejoue immédiatement). Calculé à la réception du `'New turn'` en
   * inférant depuis la dernière action diffusée (un Joker joué par la couleur
   * dont c'est de nouveau le tour). Sert à différencier la bannière de tour.
   */
  isReplayTurn = signal(false);
  /** Dernière action diffusée par le serveur (pour détecter un rejeu Joker). */
  private lastActionPlayed: Action | null = null;

  /**
   * Identifiant du hint du tutoriel actuellement affiché (ex. 'card', 'marble',
   * 'confirm', 'discard'), ou null si aucun. Publié par TutorialOverlayComponent
   * pour que d'autres composants (ex. l'aide sur les cartes) évitent de se
   * superposer au tutoriel.
   */
  tutorialHintId = signal<string | null>(null);

  /** Vrai quand c'est le tour du joueur local. */
  isMyTurn = computed(() => {
    const color = this.myPlayerColor();
    if (!color) return false;
    return this.data()?.gameState.currentTurn === color;
  });

  /** Mode de jeu de la partie (décidé par le serveur, voir GameState.gameMode). */
  gameMode = computed<GameMode>(() => this.data()?.gameState.gameMode ?? '2v2');

  /**
   * Couleur des pions contrôlés par le joueur local. En 2v2, un joueur qui a
   * rentré ses 4 pions contrôle ceux de son coéquipier (switch de fin de jeu).
   */
  controlledColor = computed<MarbleColor | null>(() => {
    const myColor = this.myPlayerColor();
    const data = this.data();
    if (!myColor || !data) return myColor;
    if (data.gameState.gameMode !== '2v2') return myColor;
    const me = data.gameState.players.find(p => p.color === myColor);
    if (!me) return myColor;
    return getControlledColor(myColor, me.marblePositions);
  });

  /** Vrai quand le joueur local a fini et joue les pions de son coéquipier. */
  isPlayingForTeammate = computed(() => {
    const myColor = this.myPlayerColor();
    return myColor !== null && this.controlledColor() !== myColor;
  });

  /**
   * Contexte de validation local — miroir exact de `buildLegalMoveContext`
   * côté serveur. Source unique pour tous les computeds de sélection et pour
   * les previews de board/table (ne plus reconstruire de ctx ailleurs).
   */
  legalCtx = computed<LegalMoveContext | null>(() => {
    const data = this.data();
    const controlled = this.controlledColor();
    if (!data || !controlled) return null;
    const players = data.gameState.players;
    const marblesByColor = Object.fromEntries(players.map(p => [p.color, p.marblePositions])) as Record<MarbleColor, number[]>;
    const invincibleMarblesByColor = Object.fromEntries(
      players.map(p => [p.color, p.marblePositions.filter((_, i) => p.marbleInvincible[i])])
    ) as Record<MarbleColor, number[]>;
    const ctx: LegalMoveContext = {
      ownMarbles: marblesByColor[controlled] ?? [],
      allMarbles: players.flatMap(p => p.marblePositions),
      playerColor: controlled,
      marblesByColor,
      invincibleMarblesByColor,
    };
    if (data.gameState.gameMode === '2v2') {
      ctx.teammateColor = getTeammateColor(controlled);
    }
    return ctx;
  });

  /**
   * Mise en jeu solidaire (2v2) : action `enter` obligatoire du pion du
   * coéquipier quand la main est bloquée avec un A/K/Joker, que le coéquipier
   * a des pions en réserve et que sa case de départ est totalement libre.
   * null si l'exception ne s'applique pas.
   */
  forcedSolidaireEntry = computed<Action | null>(() => {
    if (!this.isMyTurn()) return null;
    const ctx = this.legalCtx();
    const hand = this.data()?.gameState.hand;
    if (!ctx || !hand?.length) return null;
    return findSolidaireEntry(hand, ctx);
  });

  // ── Sélection en cours (carte + bille) ───────────────────────────────────
  selectedCard = signal<Card | null>(null);
  selectedMarblePosition = signal<number | null>(null);
  /** Pour le Jack : position de la bille cible du swap (adverse). */
  selectedSwapTargetPosition = signal<number | null>(null);
  /** Pour le 7 : nombre de pas attribués au premier pion (1–7, défaut 7). */
  sevenFirstSteps = signal<number>(7);
  /** Pour le 7 split : position du second pion sélectionné. */
  selectedSplit7MarblePosition = signal<number | null>(null);

  /** Position de départ de la carte jouée (pour l'animation depuis la main). */
  playingCardStart = signal<{ dx: number; dy: number; angle: number } | null>(null);

  /** Vrai quand une action complète et légale peut être envoyée au serveur. */
  canPlay = computed(() => {
    if (!this.isMyTurn()) return false;
    const card = this.selectedCard();
    const marblePos = this.selectedMarblePosition();
    if (!card || marblePos === null) return false;

    const ctx = this.legalCtx();
    if (!ctx) return false;

    // Mise en jeu solidaire : la seule action jouable est l'entrée d'un pion
    // du coéquipier avec une carte A/K/Joker.
    const solidaire = this.forcedSolidaireEntry();
    if (solidaire) {
      if (!ENTER_CARDS.includes(card.value)) return false;
      const teammate = ctx.teammateColor!;
      return HOME_POSITIONS[teammate].includes(marblePos)
        && ctx.marblesByColor[teammate].includes(marblePos);
    }

    if (card.value === 'J') {
      const swapTarget = this.selectedSwapTargetPosition();
      if (swapTarget === null) return false;
      return getLegalAction(card, marblePos, ctx, swapTarget) !== null;
    }

    if (card.value === '7') {
      const steps1 = this.sevenFirstSteps();
      if (steps1 === 7) {
        return getLegalAction(card, marblePos, ctx) !== null;
      }
      const split2 = this.selectedSplit7MarblePosition();
      if (split2 === null) return false;
      return getLegalSplit7Action(card, marblePos, steps1, split2, ctx) !== null;
    }

    return getLegalAction(card, marblePos, ctx) !== null;
  });

  /**
   * Positions des marbles jouables avec la carte sélectionnée.
   * null = pas de carte sélectionnée (aucun filtre actif).
   * Pour le Jack après sélection d'une bille propre : retourne les cibles adverses échangeables.
   */
  playableMarblePositions = computed<Set<number> | null>(() => {
    if (!this.isMyTurn()) return null;
    const card = this.selectedCard();
    if (!card) return null;

    const ctx = this.legalCtx();
    if (!ctx) return null;

    // Mise en jeu solidaire : seuls les pions du coéquipier en réserve sont
    // jouables, et uniquement avec une carte d'entrée (A/K/Joker).
    const solidaire = this.forcedSolidaireEntry();
    if (solidaire) {
      const playable = new Set<number>();
      if (ENTER_CARDS.includes(card.value)) {
        const teammate = ctx.teammateColor!;
        for (const pos of ctx.marblesByColor[teammate]) {
          if (HOME_POSITIONS[teammate].includes(pos)) playable.add(pos);
        }
      }
      return playable;
    }

    if (card.value === 'J') {
      const selectedSource = this.selectedMarblePosition();
      if (selectedSource === null) {
        // Phase 1 : sources possibles du swap. En 2v2 n'importe quel pion du
        // plateau peut être échangé ; en 1v3 seulement les pions contrôlés.
        const sources = ctx.teammateColor !== undefined ? ctx.allMarbles : ctx.ownMarbles;
        const playable = new Set<number>();
        for (const pos of sources) {
          if (getLegalAction(card, pos, ctx) !== null) playable.add(pos);
        }
        return playable;
      } else {
        // Phase 2 : cibles échangeables avec la source choisie (le validateur
        // impose une couleur différente de celle de la source)
        const playable = new Set<number>();
        for (const pos of ctx.allMarbles) {
          if (pos === selectedSource) continue;
          if (getLegalAction(card, selectedSource, ctx, pos) !== null) playable.add(pos);
        }
        return playable;
      }
    }

    if (card.value === '7') {
      const marble1 = this.selectedMarblePosition();
      if (marble1 === null) {
        // Phase 1 : billes contrôlées pouvant initier un coup légal complet
        // (déplacement simple de 7, ou première moitié d'un split jouable).
        const playable = new Set<number>();
        for (const pos of ctx.ownMarbles) {
          if (canMarbleStartSeven(pos, ctx)) playable.add(pos);
        }
        return playable;
      }
      const steps1 = this.sevenFirstSteps();
      if (steps1 === 7) return null; // coup simple, pas de second pion
      // Phase 2 : second pion parmi les billes contrôlées + celles du
      // coéquipier en 2v2 (hors premier pion)
      const candidates = ctx.teammateColor !== undefined
        ? [...ctx.ownMarbles, ...ctx.marblesByColor[ctx.teammateColor]]
        : ctx.ownMarbles;
      const playable = new Set<number>();
      for (const pos of candidates) {
        if (pos === marble1) continue;
        if (getLegalSplit7Action(card, marble1, steps1, pos, ctx) !== null) playable.add(pos);
      }
      return playable;
    }

    if (this.selectedMarblePosition() !== null) return null;

    const playable = new Set<number>();
    for (const pos of ctx.ownMarbles) {
      if (getLegalAction(card, pos, ctx) !== null) playable.add(pos);
    }
    return playable;
  });

  /**
   * Positions des billes propres jouables avec la carte sélectionnée.
   * Contrairement à playableMarblePositions, ce computed ne dépend pas de
   * selectedMarblePosition — il reste stable pendant toute la phase de sélection.
   * Utilisé par isDimmedMarble pour maintenir le grisage après sélection.
   */
  playableOwnMarbles = computed<Set<number> | null>(() => {
    if (!this.isMyTurn()) return null;
    const card = this.selectedCard();
    if (!card) return null;

    const ctx = this.legalCtx();
    if (!ctx) return null;

    // Mise en jeu solidaire : seuls les pions du coéquipier en réserve.
    const solidaire = this.forcedSolidaireEntry();
    if (solidaire) {
      const playable = new Set<number>();
      if (ENTER_CARDS.includes(card.value)) {
        const teammate = ctx.teammateColor!;
        for (const pos of ctx.marblesByColor[teammate]) {
          if (HOME_POSITIONS[teammate].includes(pos)) playable.add(pos);
        }
      }
      return playable;
    }

    // En 2v2, le Valet peut prendre n'importe quel pion du plateau comme source.
    const candidates = card.value === 'J' && ctx.teammateColor !== undefined
      ? ctx.allMarbles
      : ctx.ownMarbles;

    const playable = new Set<number>();
    for (const pos of candidates) {
      if (card.value === '7') {
        if (canMarbleStartSeven(pos, ctx)) playable.add(pos);
      } else if (getLegalAction(card, pos, ctx) !== null) {
        playable.add(pos);
      }
    }
    return playable;
  });

  /** Vrai si la carte 7 sélectionnée admet au moins une combinaison de split légale. */
  canSplit7Anywhere = computed<boolean>(() => {
    if (!this.isMyTurn()) return false;
    const card = this.selectedCard();
    if (!card || card.value !== '7') return false;
    const ctx = this.legalCtx();
    if (!ctx) return false;
    // Second pion : billes contrôlées + celles du coéquipier en 2v2.
    const candidates2 = ctx.teammateColor !== undefined
      ? [...ctx.ownMarbles, ...ctx.marblesByColor[ctx.teammateColor]]
      : ctx.ownMarbles;
    for (const m1 of ctx.ownMarbles) {
      const steps = getValidSevenStepsForMarble(m1, ctx).filter(s => s !== 7);
      for (const s of steps) {
        for (const m2 of candidates2) {
          if (m2 === m1) continue;
          if (getLegalSplit7Action(card, m1, s, m2, ctx) !== null) return true;
        }
      }
    }
    return false;
  });

  clearLocalHand() {
    this.data.update(state => {
      if (!state) return state;
      return {
        ...state,
        gameState: { ...state.gameState, hand: [] }
      };
    });
  }

  // ── Flux ─────────────────────────────────────────────────────────────────
  newTurn = new BehaviorSubject<Date | null>(null);
  actionPlayed$ = new Subject<Action>();
  actionRejected$ = new Subject<string>();
  /** Émet la couleur du joueur dont le tour a expiré (timeout). */
  turnTimedOut$ = new Subject<MarbleColor>();
  /** Émet la couleur du joueur déconnecté pour lequel un coup a été joué automatiquement. */
  autoPlayed$ = new Subject<MarbleColor>();
  /** Émet à chaque mise à jour du matchmaking (nombre de joueurs connectés, couleur assignée). */
  matchmakingStatus$ = new Subject<MatchmakingStatusMessage>();
  /** Émet à chaque mise à jour de l'état d'une custom room (avant que la partie ne démarre). */
  customRoomStatus$ = new Subject<CustomRoomStatusMessage>();
  /** Émet quand un joueur invité accepte ou refuse une invitation custom room. */
  gameInviteResponse$ = new Subject<GameInviteResponseMessage>();
  /** Émet dès que le serveur envoie le premier état de jeu (partie démarrée). */
  gameStarted$ = new Subject<void>();
  /** Émet quand le serveur ferme la connexion car un autre onglet a pris la relève (code 4001). */
  sessionReplaced$ = new Subject<void>();
  /** Émet quand la partie est annulée car plus aucun humain n'est connecté. */
  gameAbandoned$ = new Subject<void>();
  /** Émet quand le WebSocket échoue à se connecter ou se ferme avant que la partie commence. */
  connectionError$ = new Subject<void>();
  /** Émet quand une reconnexion automatique à la partie en cours est planifiée. */
  reconnecting$ = new Subject<void>();
  /** Émet quand le serveur confirme la reconnexion (gameState « Reconnected »). */
  reconnected$ = new Subject<void>();
  /**
   * Émet quand le serveur rejette une tentative de join/create parce que le
   * compte signed-in est déjà joueur d'une partie en cours. Les clés de
   * reconnexion sont restaurées dans localStorage avant l'émission, de sorte
   * que l'abonné n'a plus qu'à rediriger vers `/game`.
   */
  alreadyInActiveGame$ = new Subject<AlreadyInActiveGameMessage>();
  /** Émet à chaque réaction emoji reçue (locale ou distante). */
  reaction$ = new Subject<ReactionBroadcastMessage>();

  private tabLock = inject(TabLockService);
  private ws: WebSocket | null = null;

  // ── Reconnexion automatique en cours de partie ────────────────────────────
  private lastUrl: string | null = null;
  private intentionalClose = false;
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private rejoinDelayMs = 1000;
  private readonly maxRejoinDelayMs = 15_000;

  constructor() {
    // Réinitialise la sélection à chaque changement de tour
    this.newTurn.subscribe(() => {
      this.selectedCard.set(null);
      this.selectedMarblePosition.set(null);
      this.selectedSwapTargetPosition.set(null);
      this.sevenFirstSteps.set(7);
      this.selectedSplit7MarblePosition.set(null);
    });
  }

  // ── Connexion ─────────────────────────────────────────────────────────────

  connect(url: string, onOpen?: () => void): void {
    // Silence any stale handlers before replacing the socket, so that the
    // old WebSocket closing does not emit sessionReplaced$ or connectionError$.
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.lastUrl = url;
    this.intentionalClose = false;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected.set(true);
      this.rejoinDelayMs = 1000;
      console.log('Connecté au WebSocket');
      onOpen?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const parsed = JSON.parse(event.data) as ServerMessage;

      switch (parsed.type) {

        case 'actionPlayed': {
          const msg = parsed as ActionPlayedMessage;
          this.lastActionPlayed = msg.action;
          if (msg.isTimeout) this.turnTimedOut$.next(msg.action.playerColor);
          if (msg.isAutoPlay) this.autoPlayed$.next(msg.action.playerColor);
          this.actionPlayed$.next(msg.action);
          break;
        }

        case 'welcome': {
          const welcomeMsg = parsed as WelcomeMessage;
          // Store guest identity for reconnection
          this.guestPlayerId.set(welcomeMsg.guestPlayerId);
          this.activeGameId.set(welcomeMsg.gameId);
          localStorage.setItem('guest_player_id', welcomeMsg.guestPlayerId);
          localStorage.setItem('active_game_id', welcomeMsg.gameId);
          // welcome with gameState: null is just an identity message, don't update data
          if (welcomeMsg.gameState) {
            this.data.set(welcomeMsg as unknown as GameStateMessage);
            this.gameStarted$.next();
          }
          break;
        }

        case 'gameState':
        case 'response': {
          const msg = parsed as GameStateMessage;
          this.data.set(msg);
          // On reconnection, the server includes myColor so we restore the local player identity
          if (msg.myColor) {
            this.myPlayerColor.set(msg.myColor);
          }
          this.gameStarted$.next();
          if (msg.message === 'Reconnected') {
            this.reconnected$.next();
          }
          if (msg.message === 'New turn') {
            // Détecte un tour bonus Joker : la dernière action diffusée était un
            // Joker effectivement joué, et c'est de nouveau le tour de la même
            // couleur (seul le Joker accorde deux tours consécutifs).
            const a = this.lastActionPlayed;
            this.isReplayTurn.set(
              !!a && a.type !== 'discard' && a.type !== 'pass'
                && a.cardPlayed?.length === 1 && a.cardPlayed[0]?.value === 'Joker'
                && a.playerColor === msg.gameState.currentTurn,
            );
            this.newTurn.next(new Date());
          }
          break;
        }

        case 'matchmakingStatus': {
          const mmMsg = parsed as MatchmakingStatusMessage;
          this.guestPlayerId.set(mmMsg.guestPlayerId);
          localStorage.setItem('guest_player_id', mmMsg.guestPlayerId);
          this.matchmakingStatus$.next(mmMsg);
          break;
        }

        case 'customRoomStatus': {
          const crMsg = parsed as CustomRoomStatusMessage;
          this.guestPlayerId.set(crMsg.guestPlayerId);
          localStorage.setItem('guest_player_id', crMsg.guestPlayerId);
          this.customRoomStatus$.next(crMsg);
          break;
        }

        case 'gameInviteResponse': {
          this.gameInviteResponse$.next(parsed as GameInviteResponseMessage);
          break;
        }

        case 'actionRejected': {
          const msg = parsed as ActionRejectedMessage;
          console.warn('⚠️ Action rejetée par le serveur :', msg.reason);
          // Réinitialise la sélection pour que le joueur puisse réessayer
          this.selectedCard.set(null);
          this.selectedMarblePosition.set(null);
          this.actionRejected$.next(msg.reason);
          break;
        }

        case 'roomCreated':
          console.log('🏠 Room créée :', (parsed as any).roomCode);
          break;

        case 'waitingForPlayers':
          console.log('⏳ En attente de joueurs :', (parsed as any).missing);
          break;

        case 'gameEnded': {
          const msg = parsed as GameEndedMessage;
          this.clearActiveGameSession();
          this.tabLock.releaseSession();
          if (msg.reason === 'abandoned') {
            this.gameAbandoned$.next();
          } else {
            this.winReason.set(msg.reason === 'win_by_default' ? 'win_by_default' : 'win');
            this.winners.set(msg.winners);
          }
          break;
        }

        case 'gameStats': {
          this.gameStats.set(parsed as GameStatsMessage);
          break;
        }

        case 'reactionBroadcast': {
          this.reaction$.next(parsed as ReactionBroadcastMessage);
          break;
        }

        case 'alreadyInActiveGame': {
          const msg = parsed as AlreadyInActiveGameMessage;
          // The account is already a player in a running game. Restore the
          // reconnection keys so the game page can re-join, then notify the
          // caller (home page) to redirect into it.
          this.guestPlayerId.set(msg.guestPlayerId);
          this.activeGameId.set(msg.gameId);
          localStorage.setItem('guest_player_id', msg.guestPlayerId);
          localStorage.setItem('active_game_id', msg.gameId);
          this.alreadyInActiveGame$.next(msg);
          break;
        }
      }
    };

    this.ws.onerror = () => {
      this.isConnected.set(false);
      this.connectionError$.next();
    };
    this.ws.onclose = (event: CloseEvent) => {
      this.isConnected.set(false);
      // Trace la cause de la fermeture pour distinguer une WebView backgroundée
      // (visibility=hidden, codes 1001/1006) d'une vraie coupure réseau.
      console.log(
        `🔌 WebSocket fermé (code=${event.code}, reason="${event.reason}", visibility=${document.visibilityState})`,
      );
      if (this.intentionalClose) return;
      if (event.code === 4001) {
        this.tabLock.releaseSession();
        this.sessionReplaced$.next();
      } else if (this.data() === null) {
        this.connectionError$.next();
      } else {
        // Coupure inattendue en cours de partie (réseau mobile, WebView
        // backgroundée…) : on retente automatiquement le joinGame avec backoff.
        this.scheduleRejoin();
      }
    };
  }

  /**
   * Reconnexion automatique à la partie en cours après une coupure réseau.
   * Réutilise le chemin `joinGame` standard ; si le serveur ne connaît plus la
   * partie, il répondra `actionRejected` (géré par la page de jeu).
   */
  private scheduleRejoin(): void {
    const guestPlayerId = localStorage.getItem('guest_player_id');
    const activeGameId = localStorage.getItem('active_game_id');
    const url = this.lastUrl;
    if (!guestPlayerId || !activeGameId || !url) {
      this.connectionError$.next();
      return;
    }
    this.reconnecting$.next();
    const delay = this.rejoinDelayMs;
    this.rejoinDelayMs = Math.min(this.rejoinDelayMs * 2, this.maxRejoinDelayMs);
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = setTimeout(() => {
      this.rejoinTimer = null;
      console.log('🔄 Reconnexion automatique à la partie en cours…');
      this.connect(url, () => this.sendJoinGame(guestPlayerId, activeGameId));
    }, delay);
  }

  /**
   * Reconnexion immédiate à la partie en cours, sans attendre le backoff.
   * Appelée au retour de l'arrière-plan ou à un changement réseau (Wi-Fi↔data) :
   * pendant que la WebView est gelée, le backoff de `scheduleRejoin` peut avoir
   * gonflé jusqu'à 15 s — on l'annule et on le réinitialise pour reconnecter tout
   * de suite. No-op s'il n'y a pas de partie active stockée.
   * @param url URL WebSocket à utiliser si aucune connexion n'a encore eu lieu
   *            cette session (sinon on réutilise la dernière URL connue).
   */
  reconnectNow(url?: string): void {
    const guestPlayerId = localStorage.getItem('guest_player_id');
    const activeGameId = localStorage.getItem('active_game_id');
    const target = url ?? this.lastUrl;
    if (!guestPlayerId || !activeGameId || !target) return;

    // Annule un rejoin programmé et remet le backoff à zéro.
    if (this.rejoinTimer) {
      clearTimeout(this.rejoinTimer);
      this.rejoinTimer = null;
    }
    this.rejoinDelayMs = 1000;

    if (this.isConnected()) {
      // La socket a survécu : un simple joinGame rafraîchit l'état.
      this.sendJoinGame(guestPlayerId, activeGameId);
      return;
    }

    this.reconnecting$.next();
    console.log('🔄 Reconnexion immédiate à la partie en cours…');
    this.connect(target, () => this.sendJoinGame(guestPlayerId, activeGameId));
  }

  /**
   * Purge atomique de la session de jeu locale (clés de reconnexion + signaux).
   * Unique point d'entrée : ne jamais supprimer ces clés localStorage ailleurs,
   * un nettoyage partiel produit des reconnexions fantômes au prochain départ.
   */
  clearActiveGameSession(): void {
    localStorage.removeItem('active_game_id');
    localStorage.removeItem('guest_player_id');
    this.activeGameId.set(null);
    this.guestPlayerId.set(null);
  }

  // ── Configuration de partie ───────────────────────────────────────────────

  /**
   * Enregistre la config locale pour savoir qui est le joueur humain local.
   * Doit être appelé avant l'envoi du message 'start'.
   */
  setConfig(config: GameConfig): void {
    const humanPlayer = config.players.find(p => p.isHuman);
    this.myPlayerColor.set(humanPlayer?.color ?? null);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Envoie une action au serveur et réinitialise la sélection locale.
   */
  playAction(action: Action): void {
    const msg: PlayActionMessage = { type: 'playAction', action };
    this.send(JSON.stringify(msg));
    this.selectedCard.set(null);
    this.selectedMarblePosition.set(null);
    this.selectedSwapTargetPosition.set(null);
    this.sevenFirstSteps.set(7);
    this.selectedSplit7MarblePosition.set(null);
  }

  sendAnimationDone(): void {
    const msg: AnimationDoneMessage = { type: 'animationDone' };
    this.send(JSON.stringify(msg));
  }

  sendTurnTimeout(): void {
    const msg: TurnTimeoutMessage = { type: 'turnTimeout' };
    this.send(JSON.stringify(msg));
  }

  sendJoinMatchmaking(playerName?: string, picture?: string, authToken?: string, debug?: boolean): void {
    let browserId = localStorage.getItem('browser_id');
    if (!browserId) {
      browserId = crypto.randomUUID();
      localStorage.setItem('browser_id', browserId);
    }
    this.send(JSON.stringify({ type: 'joinMatchmaking', playerName, browserId, picture, authToken, debug }));
  }

  sendSelectMatchmakingSlot(color: MarbleColor): void {
    this.send(JSON.stringify({ type: 'selectMatchmakingSlot', color }));
  }

  private getOrCreateBrowserId(): string {
    let id = localStorage.getItem('browser_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('browser_id', id);
    }
    return id;
  }

  sendCreateCustomRoom(playerName: string, picture?: string, authToken?: string): void {
    this.send(JSON.stringify({
      type: 'createCustomRoom',
      playerName,
      browserId: this.getOrCreateBrowserId(),
      ...(picture ? { picture } : {}),
      ...(authToken ? { authToken } : {}),
    }));
  }

  sendJoinCustomRoom(code: string, playerName: string, picture?: string, authToken?: string): void {
    this.send(JSON.stringify({
      type: 'joinCustomRoom',
      code,
      playerName,
      browserId: this.getOrCreateBrowserId(),
      ...(picture ? { picture } : {}),
      ...(authToken ? { authToken } : {}),
    }));
  }

  sendStartCustomRoom(): void {
    this.send(JSON.stringify({ type: 'startCustomRoom' }));
  }

  sendLeaveCustomRoom(): void {
    this.send(JSON.stringify({ type: 'leaveCustomRoom' }));
  }

  sendSelectCustomSlot(color: MarbleColor): void {
    this.send(JSON.stringify({ type: 'selectCustomSlot', color }));
  }

  sendInviteUser(toUserId: string, roomCode: string): void {
    this.send(JSON.stringify({ type: 'inviteUser', toUserId, roomCode }));
  }

  sendCancelInvite(toUserId: string, roomCode: string): void {
    this.send(JSON.stringify({ type: 'cancelInvite', toUserId, roomCode }));
  }

  sendReaction(emoji: ReactionEmoji): void {
    // `fromColor` is only honored by the server in single-device mode (single
    // shared WebSocket) — in multi-device it is overridden by the authoritative
    // senderColor. We always include it so single-device works out of the box.
    const fromColor = this.myPlayerColor() ?? undefined;
    const msg: EmojiReactionMessage = fromColor
      ? { type: 'reaction', emoji, fromColor }
      : { type: 'reaction', emoji };
    this.send(JSON.stringify(msg));
  }

  sendAbandonGame(): void {
    this.send(JSON.stringify({ type: 'abandonGame' }));
    this.clearActiveGameSession();
    this.tabLock.releaseSession();
    this.reset();
  }

  /** Reset all game state so navigation to home starts clean. */
  reset(): void {
    this.data.set(null);
    this.winners.set([]);
    this.winReason.set(null);
    this.gameStats.set(null);
    this.myPlayerColor.set(null);
    this.guestPlayerId.set(null);
    this.activeGameId.set(null);
    this.selectedCard.set(null);
    this.selectedMarblePosition.set(null);
    this.selectedSwapTargetPosition.set(null);
    this.sevenFirstSteps.set(7);
    this.selectedSplit7MarblePosition.set(null);
    this.playingCardStart.set(null);
    this.boardContainerSize.set(0);
    this.isConnected.set(false);
    this.isReplayTurn.set(false);
    this.lastActionPlayed = null;
    this.tutorialHintId.set(null);
    this.intentionalClose = true;
    if (this.rejoinTimer) {
      clearTimeout(this.rejoinTimer);
      this.rejoinTimer = null;
    }
    this.rejoinDelayMs = 1000;
    this.ws?.close();
    this.ws = null;
  }

  sendJoinGame(guestPlayerId: string, activeGameId: string): void {
    const msg: JoinGameMessage = { type: 'joinGame', guestPlayerId, activeGameId };
    this.send(JSON.stringify(msg));
  }

  send(message: string): void {
    this.ws?.send(message);
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.rejoinTimer) {
      clearTimeout(this.rejoinTimer);
      this.rejoinTimer = null;
    }
    this.ws?.close();
  }
}