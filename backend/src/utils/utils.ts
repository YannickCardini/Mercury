import {
    getLegalAction,
    findLegalMoveForCard,
    getLegalSplit7Action,
    MAIN_PATH,
    type LegalMoveContext,
} from '@mercury/shared';

export { getLegalAction, findLegalMoveForCard, getLegalSplit7Action, MAIN_PATH };
export type { LegalMoveContext };

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Code de room à 6 caractères alphanumériques (ex: "A3F9KZ"). */
export function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
