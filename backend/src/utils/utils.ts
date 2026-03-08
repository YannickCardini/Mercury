import {
    getLegalAction,
    findLegalMoveForCard,
    type LegalMoveContext,
} from '@keezen/shared';

export { getLegalAction, findLegalMoveForCard };
export type { LegalMoveContext };

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
