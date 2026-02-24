import { getStartPosition } from '@keezen/shared';
import type { Action, Card, MarbleColor } from "@keezen/shared";

export function calculateMoveFromCardAndMarble(card: Card, marblePosition: number, MarbleColor: MarbleColor): Action {

    function enterMarbleIntoPlay(marblePosition: number, marbleColor: MarbleColor, card: Card): Action {
        return {
            type: 'enter',
            from: marblePosition,
            to: getStartPosition(marbleColor),
            cardPlayed: card,
            playerColor: marbleColor
        }
    }
    console.log(`Calculating move for card ${card.value} of ${card.suit} and marble at position ${marblePosition} for color ${MarbleColor}`);
    switch (card.value) {
        case 'A':
            return enterMarbleIntoPlay(marblePosition, MarbleColor, card); 
        case 'K':
            return enterMarbleIntoPlay(marblePosition, MarbleColor, card); 
        default:
            return {
                type: 'pass',
                from: 0,
                to: 0,
                cardPlayed: null,
                playerColor: MarbleColor
            }
    };
}


export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


