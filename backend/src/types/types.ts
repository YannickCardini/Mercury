export interface Card {
    id: string;
    suit: string;
    value: string;
}

 export interface Player {
    isConnected: boolean;
    name: string;
    color: 'red' | 'green' | 'blue' | 'orange';
    marblePositions: number[];
}

 export interface LastAction {
    type: 'enter' | 'move' | 'capture' | 'swap' | 'promote';
    from: number;
    to: number;
}

 export interface CurrentTurn {
    color: 'red' | 'green' | 'blue' | 'orange';
    lastAction: LastAction;
    lastCardPlayed: Card | undefined;
}

 export interface GameState {
    players: Player[];
    isConnected: boolean;
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