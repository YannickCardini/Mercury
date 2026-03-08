import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  Action,
  Card,
  GameConfig,
  GameStateMessage,
  ActionPlayedMessage,
  ActionRejectedMessage,
  AnimationDoneMessage,
  PlayActionMessage,
  ServerMessage,
  MarbleColor,
  getLegalAction,
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

  // ── Identité du joueur local ──────────────────────────────────────────────
  /** Couleur du joueur humain local. null = mode spectateur (4 IA). */
  myPlayerColor = signal<MarbleColor | null>(null);

  /** Vrai quand c'est le tour du joueur local. */
  isMyTurn = computed(() => {
    const color = this.myPlayerColor();
    if (!color) return false;
    return this.data()?.gameState.currentTurn === color;
  });

  // ── Sélection en cours (carte + bille) ───────────────────────────────────
  selectedCard = signal<Card | null>(null);
  selectedMarblePosition = signal<number | null>(null);

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

    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
    };
    return getLegalAction(card, marblePos, ctx) !== null;
  });

  /**
   * Positions des marbles jouables avec la carte sélectionnée.
   * null = pas de carte sélectionnée (aucun filtre actif).
   * Seulement actif quand la carte est sélectionnée mais pas encore de marble.
   */
  playableMarblePositions = computed<Set<number> | null>(() => {
    if (!this.isMyTurn()) return null;
    const card = this.selectedCard();
    if (!card || this.selectedMarblePosition() !== null) return null;

    const data = this.data();
    const myColor = this.myPlayerColor();
    if (!data || !myColor) return null;

    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return null;

    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
    };

    const playable = new Set<number>();
    for (const pos of player.marblePositions) {
      if (getLegalAction(card, pos, ctx) !== null) {
        playable.add(pos);
      }
    }
    return playable;
  });

  /**
   * Indices des cartes jouables avec le marble sélectionné.
   * null = pas de marble sélectionné (aucun filtre actif).
   * Seulement actif quand le marble est sélectionné mais pas encore de carte.
   */
  playableCardIndices = computed<Set<number> | null>(() => {
    if (!this.isMyTurn()) return null;
    const marblePos = this.selectedMarblePosition();
    if (marblePos === null || this.selectedCard() !== null) return null;

    const data = this.data();
    const myColor = this.myPlayerColor();
    if (!data || !myColor) return null;

    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return null;

    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
    };

    const playable = new Set<number>();
    data.gameState.hand.forEach((card, i) => {
      if (getLegalAction(card, marblePos, ctx) !== null) {
        playable.add(i);
      }
    });
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

  private ws: WebSocket | null = null;

  constructor() {
    // Réinitialise la sélection à chaque changement de tour
    this.newTurn.subscribe(() => {
      this.selectedCard.set(null);
      this.selectedMarblePosition.set(null);
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
          this.actionPlayed$.next(msg.action);
          break;
        }

        case 'gameState':
        case 'welcome':
        case 'response': {
          const msg = parsed as GameStateMessage;
          this.data.set(msg);
          if (msg.message === 'New turn') {
            this.newTurn.next(new Date());
          }
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
  }

  sendAnimationDone(): void {
    const msg: AnimationDoneMessage = { type: 'animationDone' };
    this.send(JSON.stringify(msg));
  }

  send(message: string): void {
    this.ws?.send(message);
  }

  disconnect(): void {
    this.ws?.close();
  }
}