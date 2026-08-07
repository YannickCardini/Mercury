import type { Action, Card, MarbleColor } from '@mercury/shared';
import { colorAtPosition, findSolidaireEntry } from '@mercury/shared';
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
// Joker, K et A sont bivalents (entrer depuis la maison, ou avancer de 18 / 13 / 1
// sur le chemin) : getLegalAction gère les deux cas, et findLegalMoveForCard
// privilégie l'entrée en examinant les pions en réserve en premier. Le rejeu du
// Joker est géré côté Game : l'IA rejoue simplement au tour suivant (même joueur
// courant).
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

/** Couleur alliée du point de vue du contexte : soi-même, plus le coéquipier en 2v2. */
function isAllyColor(color: MarbleColor | null, ctx: LegalMoveContext): boolean {
    return color !== null && (color === ctx.playerColor || color === ctx.teammateColor);
}

/**
 * Vrai si l'action mange un pion allié (le sien ou celui du coéquipier en 2v2).
 * L'IA évite ces coups tant qu'une alternative existe — mais ils restent
 * légaux et sont joués en dernier recours (pas d'immunité d'équipe).
 */
function capturesAlly(action: Action, ctx: LegalMoveContext): boolean {
    if (ctx.teammateColor === undefined) return false;
    const victimPositions: number[] = [];
    if (action.type === 'capture') victimPositions.push(action.to);
    if (action.splitType === 'capture' && action.splitTo !== undefined) victimPositions.push(action.splitTo);
    return victimPositions.some(pos => isAllyColor(colorAtPosition(pos, ctx.marblesByColor), ctx));
}

export class AiStrategy implements PlayerStrategy {

    async getAction(ctx: LegalMoveContext, hand: Card[]): Promise<Action> {
        if (hand.length === 0) {
            return { type: 'pass', from: 0, to: 0, cardPlayed: [], playerColor: ctx.playerColor };
        }

        if (process.env['DEBUG'] !== 'true' && !isTrainMode()) await sleep(500);

        // 🔥 Pass 1 : priorité aux captures et promotions (sans manger un allié)
        for (const targetValue of AI_CARD_PRIORITY) {
            const card = hand.find(c => c.value === targetValue);
            if (!card) continue;

            const action = findLegalMoveForCard(card, ctx);
            if (action && (action.type === 'capture' || action.type === 'promote') && !capturesAlly(action, ctx)) {
                console.log(`💥 IA joue ${card.value}${card.suit} → ${action.type} [${action.from} → ${action.to}]`);
                return action;
            }
        }

        // 🔄 Pass 2 : J card swap — jamais contre un pion allié (casser la
        // position du coéquipier n'apporte rien à l'équipe)
        const jCard = hand.find(c => c.value === 'J');
        if (jCard) {
            const enemyMarbles = ctx.allMarbles.filter(
                pos => !isAllyColor(colorAtPosition(pos, ctx.marblesByColor), ctx) && !ctx.ownMarbles.includes(pos),
            );
            for (const ownMarble of ctx.ownMarbles) {
                for (const enemyMarble of enemyMarbles) {
                    const action = getLegalAction(jCard, ownMarble, ctx, enemyMarble);
                    if (action) {
                        console.log(`🔄 IA joue J${jCard.suit} → swap [${ownMarble} ↔ ${enemyMarble}]`);
                        return action;
                    }
                }
            }
        }

        // 🚶 Pass 3 : coups normaux (enter, move), en évitant de manger un allié
        for (const targetValue of AI_CARD_PRIORITY) {
            const card = hand.find(c => c.value === targetValue);
            if (!card) continue;

            const action = findLegalMoveForCard(card, ctx);
            if (action && !capturesAlly(action, ctx)) {
                console.log(`IA joue ${card.value}${card.suit} → ${action.type} [${action.from} → ${action.to}]`);
                return action;
            }
        }

        // 🩹 Pass 4 : si les seuls coups légaux mangent un allié, il faut quand
        // même jouer (les collisions entre coéquipiers restent la règle).
        for (const targetValue of AI_CARD_PRIORITY) {
            const card = hand.find(c => c.value === targetValue);
            if (!card) continue;

            const action = findLegalMoveForCard(card, ctx);
            if (action) {
                console.log(`IA joue ${card.value}${card.suit} (capture alliée inévitable) → ${action.type} [${action.from} → ${action.to}]`);
                return action;
            }
        }

        // 🤝 Mise en jeu solidaire (2v2) : main bloquée mais A/K/Joker en main,
        // coéquipier en réserve et son start libre → entrée obligatoire.
        const solidaire = findSolidaireEntry(hand, ctx);
        if (solidaire) {
            console.log(`🤝 IA joue ${solidaire.cardPlayed![0]!.value} → entrée solidaire du coéquipier`);
            return solidaire;
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
