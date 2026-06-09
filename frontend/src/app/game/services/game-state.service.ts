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
  ReactionEmoji,
  getLegalAction,
  getLegalSplit7Action,
  getValidSevenStepsForMarble,
  canMarbleStartSeven,
  getPositionAfterMove,
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
  winner = signal<MarbleColor | null>(null);
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

    const data = this.data();
    const myColor = this.myPlayerColor();
    if (!data || !myColor) return false;

    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return false;

    const marblesByColor = Object.fromEntries(data.gameState.players.map(p => [p.color, p.marblePositions])) as Record<MarbleColor, number[]>;
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

    const data = this.data();
    const myColor = this.myPlayerColor();
    if (!data || !myColor) return null;

    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return null;

    const allMarbles = data.gameState.players.flatMap(p => p.marblePositions);
    const marblesByColor = Object.fromEntries(data.gameState.players.map(p => [p.color, p.marblePositions])) as Record<MarbleColor, number[]>;
    const invincibleMarblesByColor = Object.fromEntries(
      data.gameState.players.map(p => [p.color, p.marblePositions.filter((_, i) => p.marbleInvincible[i])])
    ) as Record<MarbleColor, number[]>;
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles,
      playerColor: myColor,
      marblesByColor,
      invincibleMarblesByColor,
    };

    if (card.value === 'J') {
      const selectedOwn = this.selectedMarblePosition();
      if (selectedOwn === null) {
        // Phase 1 : montrer les billes propres qui peuvent initier un swap
        const playable = new Set<number>();
        for (const pos of player.marblePositions) {
          if (getLegalAction(card, pos, ctx) !== null) playable.add(pos);
        }
        return playable;
      } else {
        // Phase 2 : montrer les billes adverses échangeables
        const opponentMarbles = allMarbles.filter(pos => !player.marblePositions.includes(pos));
        const playable = new Set<number>();
        for (const pos of opponentMarbles) {
          if (getLegalAction(card, selectedOwn, ctx, pos) !== null) playable.add(pos);
        }
        return playable;
      }
    }

    if (card.value === '7') {
      const marble1 = this.selectedMarblePosition();
      if (marble1 === null) {
        // Phase 1 : billes propres pouvant initier un coup légal complet
        // (déplacement simple de 7, ou première moitié d'un split jouable).
        const playable = new Set<number>();
        for (const pos of player.marblePositions) {
          if (canMarbleStartSeven(pos, ctx)) playable.add(pos);
        }
        return playable;
      }
      const steps1 = this.sevenFirstSteps();
      if (steps1 === 7) return null; // coup simple, pas de second pion
      // Phase 2 : billes propres (hors premier pion) valides pour le second mouvement
      const playable = new Set<number>();
      for (const pos of player.marblePositions) {
        if (pos === marble1) continue;
        if (getLegalSplit7Action(card, marble1, steps1, pos, ctx) !== null) playable.add(pos);
      }
      return playable;
    }

    if (this.selectedMarblePosition() !== null) return null;

    const playable = new Set<number>();
    for (const pos of player.marblePositions) {
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

    const data = this.data();
    const myColor = this.myPlayerColor();
    if (!data || !myColor) return null;

    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return null;

    const marblesByColor = Object.fromEntries(data.gameState.players.map(p => [p.color, p.marblePositions])) as Record<MarbleColor, number[]>;
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

    const playable = new Set<number>();
    for (const pos of player.marblePositions) {
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
    const data = this.data();
    const myColor = this.myPlayerColor();
    if (!data || !myColor) return false;
    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return false;
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
    for (const m1 of player.marblePositions) {
      const steps = getValidSevenStepsForMarble(m1, ctx).filter(s => s !== 7);
      for (const s of steps) {
        for (const m2 of player.marblePositions) {
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
  /** Émet à chaque réaction emoji reçue (locale ou distante). */
  reaction$ = new Subject<ReactionBroadcastMessage>();

  private tabLock = inject(TabLockService);
  private ws: WebSocket | null = null;

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

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected.set(true);
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
          localStorage.removeItem('active_game_id');
          this.tabLock.releaseSession();
          if (msg.reason === 'abandoned') {
            this.gameAbandoned$.next();
          } else {
            this.winReason.set(msg.reason === 'win_by_default' ? 'win_by_default' : 'win');
            this.winner.set(msg.winner);
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
      }
    };

    this.ws.onerror = () => {
      this.isConnected.set(false);
      this.connectionError$.next();
    };
    this.ws.onclose = (event: CloseEvent) => {
      this.isConnected.set(false);
      if (event.code === 4001) {
        this.tabLock.releaseSession();
        this.sessionReplaced$.next();
      } else if (this.data() === null) {
        this.connectionError$.next();
      }
    };
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

  sendJoinMatchmaking(playerName?: string, picture?: string, userId?: string, debug?: boolean): void {
    let browserId = localStorage.getItem('browser_id');
    if (!browserId) {
      browserId = crypto.randomUUID();
      localStorage.setItem('browser_id', browserId);
    }
    this.send(JSON.stringify({ type: 'joinMatchmaking', playerName, browserId, picture, userId, debug }));
  }

  private getOrCreateBrowserId(): string {
    let id = localStorage.getItem('browser_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('browser_id', id);
    }
    return id;
  }

  sendCreateCustomRoom(playerName: string, picture?: string, userId?: string): void {
    this.send(JSON.stringify({
      type: 'createCustomRoom',
      playerName,
      browserId: this.getOrCreateBrowserId(),
      ...(picture ? { picture } : {}),
      ...(userId ? { userId } : {}),
    }));
  }

  sendJoinCustomRoom(code: string, playerName: string, picture?: string, userId?: string): void {
    this.send(JSON.stringify({
      type: 'joinCustomRoom',
      code,
      playerName,
      browserId: this.getOrCreateBrowserId(),
      ...(picture ? { picture } : {}),
      ...(userId ? { userId } : {}),
    }));
  }

  sendStartCustomRoom(): void {
    this.send(JSON.stringify({ type: 'startCustomRoom' }));
  }

  sendLeaveCustomRoom(): void {
    this.send(JSON.stringify({ type: 'leaveCustomRoom' }));
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
    localStorage.removeItem('guest_player_id');
    localStorage.removeItem('active_game_id');
    this.tabLock.releaseSession();
    this.reset();
  }

  /** Reset all game state so navigation to home starts clean. */
  reset(): void {
    this.data.set(null);
    this.winner.set(null);
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
    this.ws?.close();
  }
}