import {
    getStartPosition,
    MAIN_PATH,
    HOME_POSITIONS,
    START_POSITIONS,
} from '@keezen/shared';
import type { Action, Card, MarbleColor } from "@keezen/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const CARD_MOVE_DISTANCE: Partial<Record<string, number>> = {
    '2': 2,
    '3': 3,
    '5': 5,
    '6': 6,
    '8': 8,
    '9': 9,
    '10': 10,
    'Q': 12,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de navigation
// ─────────────────────────────────────────────────────────────────────────────

export function getPositionAfterMove(fromPosition: number, steps: number): number | null {
    const currentIndex = MAIN_PATH.indexOf(fromPosition);
    if (currentIndex === -1) return null;

    let targetIndex = currentIndex + steps;
    if (targetIndex >= MAIN_PATH.length) targetIndex = targetIndex % MAIN_PATH.length;
    console.log("MAIN_PATH, targerIndex: ", targetIndex, MAIN_PATH[targetIndex])
    return MAIN_PATH[targetIndex] ?? null;
}

export function isOnMainPath(position: number): boolean {
    return MAIN_PATH.includes(position);
}

function isAnyStartPosition(position: number): boolean {
    return Object.values(START_POSITIONS).includes(position);
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexte de validation
// ─────────────────────────────────────────────────────────────────────────────

export interface LegalMoveContext {
    ownMarbles: number[];
    allMarbles: number[];
    playerColor: MarbleColor;
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
        // Le pion doit être en home (pas encore en jeu)
        if (!homePositions.includes(marblePosition)) return null;

        // La start est bloquée si un de nos propres pions y est déjà
        if (ownMarbles.includes(startPos)) {
            console.log(`[${playerColor}] Enter bloqué : un de nos pions est déjà sur la start (${startPos})`);
            return null;
        }

        console.log('HOMEPOSITIONS:', homePositions);
        console.log('startPos:', startPos);
        console.log('ownMarbles:', ownMarbles);

        return {
            type: 'enter',
            from: marblePosition,
            to: startPos,
            cardPlayed: [card],
            playerColor,
        };
    }

    // ── Entrée en jeu (A ou K) ──────────────────────────────────────────────
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

    // ── Déplacements standards ────────────────────────────────────────────────
    const distance = CARD_MOVE_DISTANCE[card.value];
    if (distance !== undefined && isOnMainPath(marblePosition)) {
        return buildMoveAction(card, marblePosition, distance, ctx);
    }

    // Cartes non gérées (J, 7, 4)
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

    // You cannot land on your own marble
    if (ownMarbles.includes(to)) return null;

    // Path must be clear of safe spaces
    if (!pathIsClear(from, steps, playerColor, allMarbles)) return null;

    // 🎯 Detect if the target space is occupied by an enemy
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

        // Can't overpass your start position
        if (pos === ownStartPos) return false;

        if (
            isAnyStartPosition(pos) &&
            pos !== ownStartPos &&
            allMarbles.includes(pos)
        ) {
            return false;
        }
    }

    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Façade pour player.ts
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

// ─────────────────────────────────────────────────────────────────────────────
// Divers
// ─────────────────────────────────────────────────────────────────────────────

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}