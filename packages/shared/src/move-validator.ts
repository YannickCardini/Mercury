// ─────────────────────────────────────────────────────────────────────────────
// packages/shared/src/move-validator.ts
//
// Logique de validation des coups légaux, partagée entre frontend et backend.
// ─────────────────────────────────────────────────────────────────────────────

import {
    getStartPosition,
    MAIN_PATH,
    HOME_POSITIONS,
    START_POSITIONS,
    ARRIVAL_POSITIONS,
} from './board-config.js';
import type { Action, Card, MarbleColor } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const CARD_MOVE_DISTANCE: Partial<Record<string, number>> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'Q': 12,
};

// ─────────────────────────────────────────────────────────────────────────────
// Contexte de validation
// ─────────────────────────────────────────────────────────────────────────────

export interface LegalMoveContext {
    ownMarbles: number[];
    allMarbles: number[];
    playerColor: MarbleColor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de navigation
// ─────────────────────────────────────────────────────────────────────────────

export function getPositionAfterMove(fromPosition: number, steps: number): number | null {
    const currentIndex = MAIN_PATH.indexOf(fromPosition);
    if (currentIndex === -1) return null;

    let targetIndex = currentIndex + steps;
    if (targetIndex >= MAIN_PATH.length) targetIndex = targetIndex % MAIN_PATH.length;
    return MAIN_PATH[targetIndex] ?? null;
}

export function isOnMainPath(position: number): boolean {
    return MAIN_PATH.includes(position);
}

function isAnyStartPosition(position: number): boolean {
    return Object.values(START_POSITIONS).includes(position);
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation d'un coup
// ─────────────────────────────────────────────────────────────────────────────

export function getLegalAction(
    card: Card,
    marblePosition: number,
    ctx: LegalMoveContext
): Action | null {

    const { playerColor, ownMarbles } = ctx;
    const startPos = getStartPosition(playerColor);
    const homePositions = HOME_POSITIONS[playerColor];

    function enterMarbleInGame(): Action | null {
        if (!homePositions.includes(marblePosition)) return null;
        if (ownMarbles.includes(startPos)) return null;

        return {
            type: 'enter',
            from: marblePosition,
            to: startPos,
            cardPlayed: [card],
            playerColor,
        };
    }

    if (card.value === 'K') {
        return enterMarbleInGame();
    }

    if (card.value === 'A') {
        if (homePositions.includes(marblePosition)) {
            return enterMarbleInGame();
        } else if (isOnMainPath(marblePosition)) {
            return buildMoveAction(card, marblePosition, 1, ctx);
        }
        return null;
    }

    const distance = CARD_MOVE_DISTANCE[card.value];
    if (distance !== undefined && isOnMainPath(marblePosition)) {
        return buildMoveAction(card, marblePosition, distance, ctx);
    }

    return null;
}

function buildMoveAction(
    card: Card,
    from: number,
    steps: number,
    ctx: LegalMoveContext
): Action | null {
    const { playerColor, ownMarbles, allMarbles } = ctx;

    const to = getPositionAfterMove(from, steps);
    if (to === null) return null;

    if (startPositionBtwFromAndTo(from, to, playerColor)) {
        const arrivalCase = getArrivelCaseIfCanPromote(playerColor, allMarbles, from, steps);
        if (arrivalCase != null) {
            return {
                type: 'promote',
                from,
                to: arrivalCase,
                cardPlayed: [card],
                playerColor,
            };
        }
    }

    if (ownMarbles.includes(to)) return null;
    if (!pathIsClear(from, steps, playerColor, allMarbles)) return null;

    if (allMarbles.includes(to)) {
        return {
            type: 'capture',
            from,
            to,
            cardPlayed: [card],
            playerColor,
        };
    }

    return {
        type: 'move',
        from,
        to,
        cardPlayed: [card],
        playerColor,
    };
}

function startPositionBtwFromAndTo(from: number, to: number, playerColor: MarbleColor) {
    const startPosition = START_POSITIONS[playerColor];
    if (startPosition === from) return false;
    let index = MAIN_PATH.indexOf(from);
    while (MAIN_PATH[index] !== to) {
        if (MAIN_PATH[index] === startPosition) return true;
        index++;
        if (index >= MAIN_PATH.length) index = 0;
    }
    return false;
}

function pathIsClear(
    from: number,
    steps: number,
    playerColor: MarbleColor,
    allMarbles: number[]
): boolean {
    const fromIndex = MAIN_PATH.indexOf(from);
    if (fromIndex === -1) return false;

    const ownStartPos = getStartPosition(playerColor);

    for (let i = 1; i <= steps; i++) {
        let pos;
        if ((fromIndex + i) >= MAIN_PATH.length) {
            pos = MAIN_PATH[(fromIndex + i) % MAIN_PATH.length];
        } else {
            pos = MAIN_PATH[fromIndex + i];
        }

        if (pos === undefined) return false;
        if (pos === ownStartPos) return false;
        if (isAnyStartPosition(pos) && pos !== ownStartPos && allMarbles.includes(pos)) {
            return false;
        }
    }

    return true;
}

function getArrivelCaseIfCanPromote(
    playerColor: MarbleColor,
    allMarbles: number[],
    from: number,
    steps: number
): number | null {
    let arrivalPositions = [...ARRIVAL_POSITIONS[playerColor]];
    const startPosition = START_POSITIONS[playerColor];
    for (const marble of allMarbles) {
        arrivalPositions = arrivalPositions.filter(pos => pos !== marble);
    }

    let stepsRequiredToPromote = arrivalPositions.length - 1;
    let indexOfFrom = MAIN_PATH.indexOf(from);
    while (MAIN_PATH[indexOfFrom] !== startPosition) {
        stepsRequiredToPromote++;
        indexOfFrom++;
        if (indexOfFrom >= MAIN_PATH.length) indexOfFrom = 0;
    }
    return stepsRequiredToPromote === steps ? arrivalPositions[arrivalPositions.length - 1] || null : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Façade
// ─────────────────────────────────────────────────────────────────────────────

export function findLegalMoveForCard(
    card: Card,
    ctx: LegalMoveContext
): Action | null {
    for (const marblePos of ctx.ownMarbles) {
        const action = getLegalAction(card, marblePos, ctx);
        if (action !== null) return action;
    }
    return null;
}
