import type { Action, Card } from '@keezen/shared';
import type { LegalMoveContext } from '../utils/utils.js';
import type { PlayerStrategy } from './player-strategy.js';

/**
 * Stratégie pour un joueur humain.
 *
 * N'effectue aucun calcul — attend simplement qu'une action lui soit fournie
 * depuis l'extérieur via le callback `requestAction` injecté par Game.
 *
 * C'est Game qui gère la réception du message WebSocket, la validation,
 * et le timeout. HumanStrategy est volontairement passive.
 */
export class HumanStrategy implements PlayerStrategy {

    constructor(
        private readonly requestAction: () => Promise<Action>
    ) {}

    // ctx et hand sont ignorés : la décision vient du client, pas du serveur.
    getAction(_ctx: LegalMoveContext, _hand: Card[]): Promise<Action> {
        return this.requestAction();
    }
}
