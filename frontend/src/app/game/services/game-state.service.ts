import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  Action,
  Card,
  GameConfig,
  GameStateMessage,
  ActionPlayedMessage,
  ActionRejectedMessage,
  GameEndedMessage,
  MatchmakingStatusMessage,
  WelcomeMessage,
  AnimationDoneMessage,
  TurnTimeoutMessage,
  PlayActionMessage,
  JoinGameMessage,
  ServerMessage,
  MarbleColor,
  getLegalAction,
  getLegalSplit7Action,
  getValidSevenStepsForMarble,
  getPositionAfterMove,
  type LegalMoveContext,
} from '@keezen/shared';

@Injectable({
  providedIn: 'root',
})
export class GameStateService {

  boardContainerSize = signal(0);

  // ── État serveur ──────────────────────────────────────────────────────────
  data = signal<GameStateMessage | null>(null);
  isConnected = signal(false);
  winner = signal<MarbleColor | null>(null);

  // ── Identité du joueur local ──────────────────────────────────────────────
  /** Couleur du joueur humain local. null = mode spectateur (4 IA). */
  myPlayerColor = signal<MarbleColor | null>(null);

  /** Guest player ID for reconnection. */
  guestPlayerId = signal<string | null>(null);
  /** Active game ID for reconnection. */
  activeGameId = signal<string | null>(null);

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
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
      marblesByColor,
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
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles,
      playerColor: myColor,
      marblesByColor,
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
        // Phase 1 : billes propres qui ont au moins 1 pas valide
        const playable = new Set<number>();
        for (const pos of player.marblePositions) {
          if (getValidSevenStepsForMarble(pos, ctx).length > 0) playable.add(pos);
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
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
      marblesByColor,
    };

    const playable = new Set<number>();
    for (const pos of player.marblePositions) {
      if (card.value === '7') {
        if (getValidSevenStepsForMarble(pos, ctx).length > 0) playable.add(pos);
      } else if (getLegalAction(card, pos, ctx) !== null) {
        playable.add(pos);
      }
    }
    return playable;
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
  /** Émet à chaque mise à jour du matchmaking (nombre de joueurs connectés, couleur assignée). */
  matchmakingStatus$ = new Subject<MatchmakingStatusMessage>();
  /** Émet dès que le serveur envoie le premier état de jeu (partie démarrée). */
  gameStarted$ = new Subject<void>();

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
          if (msg.isTimeout) this.turnTimedOut$.next(msg.action.playerColor);
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
          this.winner.set(msg.winner);
          localStorage.removeItem('active_game_id');
          break;
        }
      }
    };

    this.ws.onerror = () => this.isConnected.set(false);
    this.ws.onclose = () => this.isConnected.set(false);
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

  sendJoinMatchmaking(playerName?: string): void {
    this.send(JSON.stringify({ type: 'joinMatchmaking', playerName }));
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