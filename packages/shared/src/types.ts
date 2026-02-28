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
  cardsLeft: number; // Nombre de cartes restantes dans la main du joueur
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
  /** Carte jouée pour effectuer cette action, null si timeout/pass forcé */
  cardPlayed: Card[] | null;
  /** Couleur du joueur qui a effectué l'action — évite de la recalculer côté front */
  playerColor: MarbleColor | null;
}

// ── État de jeu ───────────────────────────────────────────────────────────────

export interface CurrentTurn {
  /** Couleur du joueur dont c'est actuellement le tour */
  color: MarbleColor;
  /** Dernière action effectuée (null au début d'un tour) */
  lastAction: Action | null;
}

export interface GameState {
  players: Player[];
  currentTurn: CurrentTurn;
  /** Durée du tour en secondes (ex: 30) */
  timer: number;
  /** Main du joueur local (cartes qu'il peut jouer) */
  hand: Card[];
  /** Toutes les cartes défaussées depuis le début de la partie */
  discardedCards: Card[];
}

// ── Messages WebSocket — Serveur → Client ─────────────────────────────────────

/** Message envoyé par le serveur lors de la connexion initiale */
export interface WelcomeMessage {
  type: 'welcome';
  message: string;
  timestamp: string;
  gameState: GameState;
}

/** Message envoyé par le serveur à chaque changement d'état */
export interface GameStateMessage {
  type: 'gameState';
  message: string;
  timestamp: string;
  gameState: GameState;
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
 */
export interface ActionPlayedMessage {
  type: 'actionPlayed';
  timestamp: string;
  action: Action;
}

export type ServerMessage =
  | WelcomeMessage
  | GameStateMessage
  | ResponseMessage
  | ActionPlayedMessage;

// ── Messages WebSocket — Client → Serveur ─────────────────────────────────────

/** Message envoyé par le client pour démarrer une partie */
export interface StartMessage {
  type: 'start';
  players: Pick<Player, 'name' | 'color' | 'isHuman' | 'isConnected'>[];
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

export type ClientMessage = StartMessage | PlayActionMessage | AnimationDoneMessage;