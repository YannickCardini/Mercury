import { Board } from "../game/board.js";
import type { Action, Card, MarbleColor } from "../types/types.js";

export function calculateMoveFromCardAndMarble(card: Card, marblePosition: number, MarbleColor: MarbleColor): Action {

    function enterMarbleIntoPlay(marblePosition: number, marbleColor: MarbleColor): Action {
        return {
            type: 'enter',
            from: marblePosition,
            to: Board.getStartPosition(marbleColor)
        }
    }
    console.log(`Calculating move for card ${card.value} of ${card.suit} and marble at position ${marblePosition} for color ${MarbleColor}`);
    switch (card.value) {
        case 'A':
            return enterMarbleIntoPlay(marblePosition, MarbleColor); // Move 1 space for Ace
        case 'K':
            return enterMarbleIntoPlay(marblePosition, MarbleColor); // Move 1 space for Ace
        default:
            return {
                type: 'pass',
                from: 0,
                to: 0
            }
    };
}


