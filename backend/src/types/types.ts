export interface Card {
    id: string;
    suit: string;
    value: string;
}

export interface Player {
    isConnected: boolean;
    isHuman: boolean;
    name: string;
    color: MarbleColor;
    marblePositions: number[];
}

export interface Action {
    type: ActionType;
    from: number;
    to: number;
    cardPlayed: Card;
}

export interface CurrentTurn {
    color: MarbleColor;
    lastAction: Action | null;
}

export interface GameState {
    players: Player[];
    currentTurn: CurrentTurn;
    hand: Card[];
    timer: number;
    discardedCards: Card[];
}

export interface WelcomeMessage {
    type: 'welcome';
    message: string;
    timestamp: string;
    gameState: GameState;
}

export interface GameStateMessage {
    type: 'gameState';
    gameState: GameState;
    timestamp: string;
    message: string;
}

export interface ResponseMessage {
    type: 'response';
    echo: string;
    gameState: GameState;
    timestamp: string;
}

export type ServerMessage = WelcomeMessage | GameStateMessage | ResponseMessage;
export type MarbleColor = 'red' | 'green' | 'blue' | 'orange';
type ActionType =
    | 'move'      // déplacement simple
    | 'capture'   // prise d'un pion adverse
    | 'swap'      // échange
    | 'promote'   // promotion
    | 'pass'      // jeter ces cartes
    | 'enter';    // entrée en jeu
