import type { Action, Card } from '@mercury/shared';
import { findLegalMoveForCard, getLegalAction, sleep, type LegalMoveContext } from '../utils/utils.js';
import { isTrainMode } from '../train-mode.js';
import type { PlayerStrategy } from './player-strategy.js';

// ─────────────────────────────────────────────────────────────────────────────
// Priorité des cartes pour l'IA
//
//  1. Joker → entrer OU avancer de 18, ET rejouer : la carte la plus forte
//  2. K/A  → entrer un pion en jeu est toujours prioritaire
//  3. Q    → avance de 12, très efficace
//  4. 10 … → grands déplacements en premier
//
// Le Joker est géré par getLegalAction (entrée depuis la maison ou +18 sur le
// chemin), donc findLegalMoveForCard le reconnaît comme coup légal. Le rejeu est
// géré côté Game : l'IA rejoue simplement au tour suivant (même joueur courant).
//
// Cartes non gérées pour l'instant (7 : split, 4 : recul) →
// getLegalAction retourne null pour leurs comportements spéciaux, donc l'IA
// les passera naturellement si aucun coup standard n'est trouvable.
// ─────────────────────────────────────────────────────────────────────────────

const AI_CARD_PRIORITY: Card['value'][] = [
    'Joker',
    'K', 'A',
    'Q',
    '10', '9', '8', '7', '6', '5', '4', '3', '2',
];

export class AiStrategy implements PlayerStrategy {

    async getAction(ctx: LegalMoveContext, hand: Card[]): Promise<Action> {
        if (hand.length === 0) {
            return { type: 'pass', from: 0, to: 0, cardPlayed: [], playerColor: ctx.playerColor };
        }

        if (process.env['DEBUG'] !== 'true' && !isTrainMode()) await sleep(500);

        // 🔥 Pass 1 : priorité aux captures et promotions
        for (const targetValue of AI_CARD_PRIORITY) {
            const card = hand.find(c => c.value === targetValue);
            if (!card) continue;

            const action = findLegalMoveForCard(card, ctx);
            if (action && (action.type === 'capture' || action.type === 'promote')) {
                console.log(`💥 IA joue ${card.value}${card.suit} → ${action.type} [${action.from} → ${action.to}]`);
                return action;
            }
        }

        // 🔄 Pass 2 : J card swap
        const jCard = hand.find(c => c.value === 'J');
        if (jCard) {
            const opponentMarbles = ctx.allMarbles.filter(pos => !ctx.ownMarbles.includes(pos));
            for (const ownMarble of ctx.ownMarbles) {
                for (const opponentMarble of opponentMarbles) {
                    const action = getLegalAction(jCard, ownMarble, ctx, opponentMarble);
                    if (action) {
                        console.log(`🔄 IA joue J${jCard.suit} → swap [${ownMarble} ↔ ${opponentMarble}]`);
                        return action;
                    }
                }
            }
        }

        // 🚶 Pass 3 : coups normaux (enter, move)
        for (const targetValue of AI_CARD_PRIORITY) {
            const card = hand.find(c => c.value === targetValue);
            if (!card) continue;

            const action = findLegalMoveForCard(card, ctx);
            if (action) {
                console.log(`IA joue ${card.value}${card.suit} → ${action.type} [${action.from} → ${action.to}]`);
                return action;
            }
        }

        // Aucun coup légal : défausse toute la main
        console.log(`IA ne peut jouer aucune carte → défausse`);
        return {
            type: 'discard',
            from: 0,
            to: 0,
            cardPlayed: [...hand],
            playerColor: ctx.playerColor,
        };
    }
}
