// ─────────────────────────────────────────────────────────────────────────────
// packages/shared/src/types.ts
//
// Source unique de vérité pour tous les types partagés entre le front et le back.
// Ne jamais dupliquer ces interfaces dans apps/frontend ou apps/backend.
// ─────────────────────────────────────────────────────────────────────────────

// ── Primitives ────────────────────────────────────────────────────────────────

export type MarbleColor = 'red' | 'green' | 'blue' | 'orange';

export type ActionType =
  | 'move'     // déplacement simple sur le chemin
  | 'enter'    // entrée en jeu depuis la maison
  | 'capture'  // prise d'un pion adverse (le pion capturé retourne à la maison)
  | 'swap'     // échange de position entre deux pions
  | 'promote'  // promotion (pion atteint la zone d'arrivée)
  | 'discard'  // défausse de la main
  | 'pass';    // le joueur ne peut pas jouer, il passe

export type CardSuit = '♥' | '♦' | '♣' | '♠';
export type CardValue = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

// ── Entités ───────────────────────────────────────────────────────────────────

export interface Card {
  id: string;
  suit: CardSuit;
  value: CardValue;
}

export interface Player {
  name: string;
  color: MarbleColor;
  isHuman: boolean;
  isConnected: boolean;
  marblePositions: number[];
  cardsLeft: number;
  picture?: string;
  userId?: string;
}

/**
 * Une action jouée par un joueur.
 * `cardPlayed` est null uniquement pour les actions de type 'pass' forcé par timeout.
 */
export interface Action {
  type: ActionType;
  /** Position de départ du pion (0 si non applicable, ex: 'pass') */
  from: number;
  /** Position d'arrivée du pion (0 si non applicable, ex: 'pass') */
  to: number;
  /** Carte(s) jouée(s) pour effectuer cette action, null si timeout/pass forcé */
  cardPlayed: Card[] | null;
  /** Couleur du joueur qui a effectué l'action */
  playerColor: MarbleColor;
  /** Pour un split du 7 : position de départ du second pion */
  splitFrom?: number;
  /** Pour un split du 7 : position d'arrivée du second pion */
  splitTo?: number;
  /** Pour un split du 7 : type de mouvement du second pion (move/capture/promote) */
  splitType?: ActionType;
}

// ── Configuration de partie ───────────────────────────────────────────────────

export interface PlayerConfig {
  name: string;
  color: MarbleColor;
  isHuman: boolean;
  picture?: string;
  userId?: string;
}

export interface GameConfig {
  players: PlayerConfig[];
}

// ── État de jeu ───────────────────────────────────────────────────────────────

export interface GameState {
  players: Player[];
  currentTurn: MarbleColor;
  /** Durée du tour en secondes (ex: 30) */
  timer: number;
  /**
   * Main du joueur courant.
   * En mode single-device : contient toutes les cartes du joueur actif.
   * En mode multi-device (Phase 4) : à envoyer uniquement au bon client via sendTo().
   */
  hand: Card[];
  /** Toutes les cartes défaussées depuis le début de la partie */
  discardedCards: Card[];
  /**
   * Vrai si le joueur courant n'a aucun coup légal disponible.
   * Le frontend l'utilise pour adapter le bouton Confirmer/Défausser.
   */
  canDiscard: boolean;
}

// ── Messages WebSocket — Serveur → Client ─────────────────────────────────────

/** Message envoyé par le serveur lors de la connexion initiale */
export interface WelcomeMessage {
  type: 'welcome';
  message: string;
  timestamp: string;
  gameState: GameState;
  guestPlayerId: string;
  gameId: string;
}

/** Message envoyé par le serveur à chaque changement d'état */
export interface GameStateMessage {
  type: 'gameState';
  message: string;
  timestamp: string;
  gameState: GameState;
  /** Present only on reconnection — tells the client which color they control. */
  myColor?: MarbleColor;
}

/** Message envoyé par le serveur en réponse à une action du client */
export interface ResponseMessage {
  type: 'response';
  message: string;
  timestamp: string;
  gameState: GameState;
}

/**
 * Message envoyé par le serveur dès qu'un joueur a joué une action.
 * Le serveur attend un `AnimationDoneMessage` du client avant de passer
 * au tour suivant — ce qui garantit que les animations sont terminées.
 * `isTimeout` est vrai si l'action a été jouée automatiquement suite à un dépassement de temps.
 */
export interface ActionPlayedMessage {
  type: 'actionPlayed';
  timestamp: string;
  action: Action;
  isTimeout?: boolean;
  /** True when the action was auto-played because the human player is disconnected. */
  isAutoPlay?: boolean;
}

/** Envoyé quand le serveur rejette une action humaine invalide */
export interface ActionRejectedMessage {
  type: 'actionRejected';
  reason: string;
}

/** Envoyé par le serveur quand la partie se termine (victoire ou abandon). */
export interface GameEndedMessage {
  type: 'gameEnded';
  winner: MarbleColor | null;
  reason?: 'win' | 'abandoned';
}

/**
 * Envoyé par le serveur à chaque changement dans la session matchmaking.
 * Chaque joueur reçoit sa propre couleur assignée.
 */
export interface MatchmakingStatusMessage {
  type: 'matchmakingStatus';
  connectedCount: number;
  totalNeeded: number;
  myColor: MarbleColor;
  guestPlayerId: string;
}

/** Envoyé au créateur d'une room multi-device */
export interface RoomCreatedMessage {
  type: 'roomCreated';
  roomCode: string;
}

/** Envoyé à tous les membres d'une room tant qu'elle n'est pas complète */
export interface WaitingForPlayersMessage {
  type: 'waitingForPlayers';
  connected: MarbleColor[];
  missing: MarbleColor[];
}

export type ServerMessage =
  | WelcomeMessage
  | GameStateMessage
  | ResponseMessage
  | ActionPlayedMessage
  | ActionRejectedMessage
  | RoomCreatedMessage
  | WaitingForPlayersMessage
  | GameEndedMessage
  | MatchmakingStatusMessage;

// ── Messages WebSocket — Client → Serveur ─────────────────────────────────────

/**
 * Démarre une partie immédiatement sur le WebSocket courant.
 * Cas d'usage : single-device (tout le monde joue sur le même écran).
 */
export interface StartMessage {
  type: 'start';
  config: GameConfig;
}

/**
 * Rejoint la file d'attente matchmaking publique.
 * Le serveur assigne une couleur et lance la partie dès que 4 joueurs sont présents
 * (ou remplit avec des bots après 30 s).
 */
export interface JoinMatchmakingMessage {
  type: 'joinMatchmaking';
  playerName?: string;
  /** Persistent browser identity used to prevent duplicate matchmaking entries from the same browser. */
  browserId?: string;
  picture?: string;
  userId?: string;
}

/**
 * Crée une room multi-device.
 * Le créateur est automatiquement inscrit comme premier joueur humain.
 * Les autres joueurs humains rejoignent via JoinRoomMessage.
 */
export interface CreateRoomMessage {
  type: 'createRoom';
  config: GameConfig;
}

/**
 * Rejoint une room existante via son code.
 * `playerColor` identifie quel joueur humain se connecte depuis ce device.
 */
export interface JoinRoomMessage {
  type: 'joinRoom';
  roomCode: string;
  playerColor: MarbleColor;
}

/** Message envoyé par le client quand il joue une action */
export interface PlayActionMessage {
  type: 'playAction';
  action: Action;
}

/**
 * Message envoyé par le client quand toutes ses animations sont terminées.
 * Le serveur l'attend pour déclencher le tour suivant.
 */
export interface AnimationDoneMessage {
  type: 'animationDone';
}

/**
 * Message envoyé par le client quand son timer de tour arrive à 0.
 * Le serveur joue alors un coup automatique à la place du joueur humain.
 * Le serveur dispose d'un timer de sécurité (TURN_DURATION + offset) au cas où
 * le frontend serait déconnecté ou crashé.
 */
export interface TurnTimeoutMessage {
  type: 'turnTimeout';
}

/**
 * Sent by the client on app init when localStorage contains a guest_player_id
 * and an active_game_id. The server re-binds this WebSocket to the player's slot
 * in the running game if the reconnection window (180 s) has not expired.
 */
export interface JoinGameMessage {
  type: 'joinGame';
  guestPlayerId: string;
  activeGameId: string;
}

/**
 * Envoyé par le client quand il abandonne la partie en cours.
 * Le serveur marque le joueur comme déconnecté et vérifie si la partie
 * doit être annulée (plus aucun humain connecté).
 */
export interface AbandonGameMessage {
  type: 'abandonGame';
}

export type ClientMessage =
  | StartMessage
  | CreateRoomMessage
  | JoinRoomMessage
  | JoinMatchmakingMessage
  | PlayActionMessage
  | AnimationDoneMessage
  | TurnTimeoutMessage
  | JoinGameMessage
  | AbandonGameMessage;
