interface Card {
  id: string;
  suit: string;
  value: string;
}

type PlayerColor = 'red' | 'green' | 'blue' | 'orange';

export interface GameState {
  redPlayerIsConnected: boolean;
  greenPlayerIsConnected: boolean;
  bluePlayerIsConnected: boolean;
  orangePlayerIsConnected: boolean;
  isConnected: boolean;
  currentTurn: PlayerColor;
  hand: Card[];
  redPlayerMarblePosition: number[];
  greenPlayerMarblePosition: number[];
  bluePlayerMarblePosition: number[];
  orangePlayerMarblePosition: number[];
  discardedCards: Card[];

}

export interface GameData {
  gameState: GameState;
  message: string;
  timestamp: number;
  type: string;
}