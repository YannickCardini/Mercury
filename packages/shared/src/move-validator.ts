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
import { JOKER_MOVE_DISTANCE, KING_MOVE_DISTANCE } from './types.js';
import type { Action, Card, MarbleColor } from './types.js';
import { sameTeam } from './teams.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const CARD_MOVE_DISTANCE: Partial<Record<string, number>> = {
    '2': 2,
    '3': 3,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'Q': 12,
    // Joker : avance de 18 (> 12, le max précédent) lorsqu'il est joué comme déplacement.
    'Joker': JOKER_MOVE_DISTANCE,
};

// ─────────────────────────────────────────────────────────────────────────────
// Contexte de validation
// ─────────────────────────────────────────────────────────────────────────────

export interface LegalMoveContext {
    /**
     * Pions CONTRÔLÉS par le joueur actif. En 2v2, un joueur qui a rentré ses
     * 4 pions contrôle ceux de son coéquipier : `ownMarbles` et `playerColor`
     * désignent alors le coéquipier (voir getControlledColor dans teams.ts).
     */
    ownMarbles: number[];
    allMarbles: number[];
    /** Couleur des pions contrôlés (start/arrivées utilisés pour entrer/promouvoir). */
    playerColor: MarbleColor;
    marblesByColor: Record<MarbleColor, number[]>;
    /**
     * Positions des pions invincibles, par couleur. Un pion invincible vient
     * d'entrer en jeu via A/K/Joker sur sa case de départ et n'a pas encore bougé.
     * Il bloque le chemin, ne peut être reculé par un 4, ni échangé par un J.
     */
    invincibleMarblesByColor: Record<MarbleColor, number[]>;
    /**
     * Mode 2v2 uniquement : couleur du coéquipier de `playerColor`. Sa présence
     * active toutes les règles d'équipe du validateur (Valet libre, 7 partagé,
     * mise en jeu solidaire). Absent = mode 1v3, comportement historique.
     */
    teammateColor?: MarbleColor;
}

function isInvincible(
    pos: number,
    color: MarbleColor,
    invincibleMarblesByColor: Record<MarbleColor, number[]>,
): boolean {
    return invincibleMarblesByColor[color]?.includes(pos) ?? false;
}

export function colorAtPosition(
    pos: number,
    marblesByColor: Record<MarbleColor, number[]>,
): MarbleColor | null {
    for (const color of Object.keys(marblesByColor) as MarbleColor[]) {
        if (marblesByColor[color].includes(pos)) return color;
    }
    return null;
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

function getPositionAfterBackwardMove(fromPosition: number, steps: number): number | null {
    const currentIndex = MAIN_PATH.indexOf(fromPosition);
    if (currentIndex === -1) return null;

    let targetIndex = currentIndex - steps;
    if (targetIndex < 0) targetIndex = MAIN_PATH.length + targetIndex;
    return MAIN_PATH[targetIndex] ?? null;
}

export function isOnMainPath(position: number): boolean {
    return MAIN_PATH.includes(position);
}

function isOnAnyArrivalPosition(position: number): boolean {
    return Object.values(ARRIVAL_POSITIONS).some(arr => arr.includes(position));
}

function isOnAnyHomePosition(position: number): boolean {
    return Object.values(HOME_POSITIONS).some(arr => arr.includes(position));
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation d'un coup
// ─────────────────────────────────────────────────────────────────────────────

export function getLegalAction(
    card: Card,
    marblePosition: number,
    ctx: LegalMoveContext,
    targetPosition?: number
): Action | null {

    const { playerColor, ownMarbles, allMarbles } = ctx;
    const startPos = getStartPosition(playerColor);
    const homePositions = HOME_POSITIONS[playerColor];

    // Garde de propriété : sauf pour le Valet (qui peut, en 2v2, échanger deux
    // pions étrangers), le pion joué doit être un pion contrôlé par le joueur.
    // Indispensable côté serveur, où `marblePosition` vient du client.
    if (card.value !== 'J' && !ownMarbles.includes(marblePosition)) return null;

    function enterMarbleInGame(): Action | null {
        if (!homePositions.includes(marblePosition)) return null;
        if (ownMarbles.includes(startPos)) return null;

        return {
            type: 'enter',
            from: marblePosition,
            to: startPos,
            cardPlayed: [card],
            playerColor,
            marbleColor: playerColor,
        };
    }

    // Roi : fait ENTRER un pion depuis la maison, OU avance un pion déjà en jeu
    // de 13 cases. Le joueur choisit l'option en sélectionnant le pion concerné
    // (un pion en maison ⇒ entrée ; un pion sur le chemin ⇒ +13).
    if (card.value === 'K') {
        if (homePositions.includes(marblePosition)) {
            return enterMarbleInGame();
        } else if (isOnMainPath(marblePosition)) {
            return buildMoveAction(card, marblePosition, KING_MOVE_DISTANCE, ctx);
        }
        return null;
    }

    if (card.value === 'A') {
        if (homePositions.includes(marblePosition)) {
            return enterMarbleInGame();
        } else if (isOnMainPath(marblePosition)) {
            return buildMoveAction(card, marblePosition, 1, ctx);
        }
        return null;
    }

    // Joker : comme un A/K, fait ENTRER un pion depuis la maison, OU avance un
    // pion déjà en jeu de 18 cases. Le joueur choisit l'option en sélectionnant
    // le pion concerné (un pion en maison ⇒ entrée ; un pion sur le chemin ⇒ +18).
    if (card.value === 'Joker') {
        if (homePositions.includes(marblePosition)) {
            return enterMarbleInGame();
        } else if (isOnMainPath(marblePosition)) {
            return buildMoveAction(card, marblePosition, JOKER_MOVE_DISTANCE, ctx);
        }
        return null;
    }

    if (card.value === 'J') {
        if (!isOnMainPath(marblePosition)) return null;
        // 1v3 : la source de l'échange doit être un pion du joueur actif.
        // 2v2 : la source peut être n'importe quel pion (le sien, celui du
        // coéquipier, ou un pion adverse) — mais l'échange doit impliquer au
        // moins un pion de l'équipe active (voir filtre swappableTargets
        // ci-dessous) : un échange adverse ↔ adverse est interdit.
        const sourceColor = ctx.teammateColor !== undefined
            ? colorAtPosition(marblePosition, ctx.marblesByColor)
            : (ownMarbles.includes(marblePosition) ? playerColor : null);
        if (sourceColor === null) return null;
        // Un pion fraîchement entré via A/K/Joker (invincible) ne peut être ni
        // source ni cible tant qu'il n'a pas bougé.
        if (isInvincible(marblePosition, sourceColor, ctx.invincibleMarblesByColor)) return null;

        const sourceIsOwnTeam = sameTeam(sourceColor, playerColor);
        const swappableTargets = allMarbles.filter(pos => {
            if (pos === marblePosition) return false;
            const targetColor = colorAtPosition(pos, ctx.marblesByColor);
            if (targetColor === null || targetColor === sourceColor) return false;
            if (isInvincible(pos, targetColor, ctx.invincibleMarblesByColor)) return false;
            // 2v2 : refuser un échange où ni la source ni la cible n'appartient
            // à l'équipe active (échange adverse ↔ adverse).
            if (ctx.teammateColor !== undefined && !sourceIsOwnTeam && !sameTeam(targetColor, playerColor)) return false;
            return !isOnAnyArrivalPosition(pos) && !isOnAnyHomePosition(pos);
        });

        if (targetPosition !== undefined) {
            if (!swappableTargets.includes(targetPosition)) return null;
            return { type: 'swap', from: marblePosition, to: targetPosition, cardPlayed: [card], playerColor, marbleColor: sourceColor };
        }

        const target = swappableTargets[0];
        if (target === undefined) return null;
        return { type: 'swap', from: marblePosition, to: target, cardPlayed: [card], playerColor, marbleColor: sourceColor };
    }

    if (card.value === '4') {
        if (!isOnMainPath(marblePosition)) return null;
        // Un pion invincible (= fraîchement entré, n'a jamais bougé) ne peut
        // pas être déplacé en arrière. Un pion non-invincible peut reculer
        // même s'il se trouve sur sa propre case de départ.
        if (isInvincible(marblePosition, playerColor, ctx.invincibleMarblesByColor)) return null;
        return buildBackwardMoveAction(card, marblePosition, 4, ctx);
    }

    const distance = CARD_MOVE_DISTANCE[card.value];
    if (distance !== undefined && isOnMainPath(marblePosition)) {
        return buildMoveAction(card, marblePosition, distance, ctx);
    }

    return null;
}

export function getActionForSteps(
    card: Card,
    from: number,
    steps: number,
    ctx: LegalMoveContext
): Action | null {
    return buildMoveAction(card, from, steps, ctx);
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
        const arrivalCase = getArrivelCaseIfCanPromote(
            playerColor,
            allMarbles,
            from,
            steps,
            ctx.marblesByColor,
            ctx.invincibleMarblesByColor,
        );
        if (arrivalCase != null) {
            return {
                type: 'promote',
                from,
                to: arrivalCase,
                cardPlayed: [card],
                playerColor,
                marbleColor: playerColor,
            };
        }
    }

    if (ownMarbles.includes(to)) return null;
    if (!pathIsClear(from, steps, playerColor, allMarbles, ctx.marblesByColor, ctx.invincibleMarblesByColor)) return null;

    if (allMarbles.includes(to)) {
        return {
            type: 'capture',
            from,
            to,
            cardPlayed: [card],
            playerColor,
            marbleColor: playerColor,
        };
    }

    return {
        type: 'move',
        from,
        to,
        cardPlayed: [card],
        playerColor,
        marbleColor: playerColor,
    };
}

/**
 * Comme `buildMoveAction`, mais pour un pion qui n'appartient pas forcément au
 * joueur du contexte : résout le propriétaire de `from` via `marblesByColor`
 * et reconstruit le contexte de SON point de vue (son start, ses arrivées, ses
 * pions pour le blocage d'atterrissage). Utilisé pour le second pion d'un
 * split de 7 partagé avec le coéquipier (2v2) et par la preview du frontend.
 */
export function buildMoveActionForMarble(
    card: Card,
    from: number,
    steps: number,
    ctx: LegalMoveContext
): Action | null {
    const owner = colorAtPosition(from, ctx.marblesByColor);
    if (owner === null) return null;
    if (owner === ctx.playerColor) return buildMoveAction(card, from, steps, ctx);

    const ownerCtx: LegalMoveContext = {
        ...ctx,
        playerColor: owner,
        ownMarbles: [...ctx.marblesByColor[owner]],
    };
    return buildMoveAction(card, from, steps, ownerCtx);
}

function buildBackwardMoveAction(
    card: Card,
    from: number,
    steps: number,
    ctx: LegalMoveContext
): Action | null {
    const { playerColor, ownMarbles, allMarbles } = ctx;

    const to = getPositionAfterBackwardMove(from, steps);
    if (to === null) return null;

    if (ownMarbles.includes(to)) return null;

    // Check intermediate squares and destination for invincible marbles.
    // A marble is invincible only while it has just entered (via A/K) and has
    // not yet moved — its position on its own start is not enough on its own.
    for (let i = 1; i <= steps; i++) {
        const pos = getPositionAfterBackwardMove(from, i);
        if (pos === null) return null;
        const owner = colorAtPosition(pos, ctx.marblesByColor);
        if (owner !== null && isInvincible(pos, owner, ctx.invincibleMarblesByColor)) return null;
    }

    if (allMarbles.includes(to)) {
        return {
            type: 'capture',
            from,
            to,
            cardPlayed: [card],
            playerColor,
            marbleColor: playerColor,
        };
    }

    return {
        type: 'move',
        from,
        to,
        cardPlayed: [card],
        playerColor,
        marbleColor: playerColor,
    };
}

function startPositionBtwFromAndTo(from: number, to: number, playerColor: MarbleColor) {
    const startPosition = START_POSITIONS[playerColor];
    if (startPosition === from) return false;
    if (startPosition === to) return true;
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
    allMarbles: number[],
    marblesByColor: Record<MarbleColor, number[]>,
    invincibleMarblesByColor: Record<MarbleColor, number[]>,
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
        // On ne peut pas traverser sa propre case de départ (la logique de
        // promotion s'en occupe en amont) — sauf pour la case de destination,
        // qui peut éventuellement BOUCLER sur le start sans le "traverser".
        if (pos === ownStartPos) return false;
        // Tout pion invincible (toujours sur sa propre case de départ) bloque.
        if (allMarbles.includes(pos)) {
            const owner = colorAtPosition(pos, marblesByColor);
            if (owner !== null && isInvincible(pos, owner, invincibleMarblesByColor)) {
                return false;
            }
        }
    }

    return true;
}

function getArrivelCaseIfCanPromote(
    playerColor: MarbleColor,
    allMarbles: number[],
    from: number,
    steps: number,
    marblesByColor: Record<MarbleColor, number[]>,
    invincibleMarblesByColor: Record<MarbleColor, number[]>,
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
        // Un pion invincible sur le chemin (avant d'atteindre la case de
        // départ) bloque la promotion, comme pour un déplacement normal —
        // sinon ce chemin de code (promotion) contourne pathIsClear.
        // La case de départ elle-même est exclue : le pion promu bifurque
        // dans le couloir d'arrivée sans l'occuper, donc un pion invincible
        // de sa propre couleur posé dessus ne le bloque pas.
        const pos = MAIN_PATH[indexOfFrom];
        if (pos === startPosition) continue;
        const owner = colorAtPosition(pos, marblesByColor);
        if (owner !== null && isInvincible(pos, owner, invincibleMarblesByColor)) {
            return null;
        }
    }
    return stepsRequiredToPromote === steps ? arrivalPositions[arrivalPositions.length - 1] || null : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logique du 7 (split)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne la liste des nombres de pas valides (1–7) pour un pion donné avec le 7.
 * Utilisé par le frontend pour construire le sélecteur de split.
 */
export function getValidSevenStepsForMarble(
    marblePos: number,
    ctx: LegalMoveContext
): number[] {
    const dummyCard: Card = { id: '__7_check__', value: '7', suit: '♠' };
    const valid: number[] = [];
    for (let s = 1; s <= 7; s++) {
        // `ForMarble` : le pion évalué peut appartenir au coéquipier (2v2) —
        // ses pas valides dépendent alors de SON start et de SES arrivées.
        if (buildMoveActionForMarble(dummyCard, marblePos, s, ctx) !== null) {
            valid.push(s);
        }
    }
    return valid;
}

/**
 * Candidats possibles pour le SECOND pion d'un split de 7 : les pions
 * contrôlés, plus ceux du coéquipier en 2v2 (« le joueur actif doit bouger
 * l'un de ses pions en premier, puis peut utiliser les points restants pour
 * bouger un pion de son coéquipier »).
 */
function splitSecondMarbleCandidates(ctx: LegalMoveContext): number[] {
    if (ctx.teammateColor === undefined) return ctx.ownMarbles;
    return [...ctx.ownMarbles, ...ctx.marblesByColor[ctx.teammateColor]];
}

/**
 * Valide un split du 7 :
 *  - Premier pion : `from1` avance de `steps1` pas
 *  - Second pion  : `from2` avance de `7 - steps1` pas
 * Le contexte du second mouvement tient compte du déplacement du premier pion.
 * Retourne l'Action composite ou null si illégal.
 */
export function getLegalSplit7Action(
    card: Card,
    from1: number,
    steps1: number,
    from2: number,
    ctx: LegalMoveContext
): Action | null {
    if (steps1 < 1 || steps1 > 6) return null;
    const steps2 = 7 - steps1;

    // Le PREMIER pion doit être un pion contrôlé par le joueur — c'est aussi
    // la règle 2v2 « le joueur actif doit bouger l'un de ses pions en premier »
    // (commencer par un pion du coéquipier est illégal), et la garde de
    // propriété côté serveur.
    if (!ctx.ownMarbles.includes(from1)) return null;

    if (!isOnMainPath(from2)) return null;
    // Second pion : un pion contrôlé, ou un pion du coéquipier en 2v2.
    if (!splitSecondMarbleCandidates(ctx).includes(from2)) return null;

    // Les deux moitiés d'un split bougent dans le cadre du MÊME coup : si la
    // destination du premier pion coïncide avec la position ACTUELLE du
    // second (typiquement : promouvoir un coéquipier situé exactement
    // `steps1` cases devant soi), ce n'est pas une capture — le second pion
    // est justement en train de quitter cette case dans ce même coup. On le
    // retire donc du plateau pour calculer le premier mouvement, afin qu'il
    // ne soit pas traité comme un obstacle/une victime.
    const ctxWithoutFrom2: LegalMoveContext = {
        ...ctx,
        allMarbles: ctx.allMarbles.filter(p => p !== from2),
    };
    const action1 = buildMoveAction(card, from1, steps1, ctxWithoutFrom2);
    if (action1 === null) return null;
    const to1 = action1.to;

    // Contexte mis à jour : le premier pion a déjà bougé.
    // Note : un pion qui vient de bouger n'est plus invincible — on retire
    // donc from1 de invincibleMarblesByColor (sans le remplacer par to1).
    const ctx2: LegalMoveContext = {
        ...ctx,
        allMarbles: ctx.allMarbles.map(p => p === from1 ? to1 : p),
        ownMarbles: ctx.ownMarbles.map(p => p === from1 ? to1 : p),
        marblesByColor: Object.fromEntries(
            Object.entries(ctx.marblesByColor).map(([color, positions]) => [
                color,
                positions.map(p => p === from1 ? to1 : p),
            ])
        ) as Record<MarbleColor, number[]>,
        invincibleMarblesByColor: Object.fromEntries(
            Object.entries(ctx.invincibleMarblesByColor).map(([color, positions]) => [
                color,
                positions.filter(p => p !== from1),
            ])
        ) as Record<MarbleColor, number[]>,
    };

    // `ForMarble` : si le second pion appartient au coéquipier, son mouvement
    // est validé de SON point de vue (son start, ses arrivées).
    const action2 = buildMoveActionForMarble(card, from2, steps2, ctx2);
    if (action2 === null) return null;
    const to2 = action2.to;

    // Les deux pions ne peuvent pas atterrir sur la même case.
    if (to1 === to2) return null;

    const owner2 = colorAtPosition(from2, ctx.marblesByColor) ?? ctx.playerColor;

    return {
        type: action1.type,
        from: from1,
        to: to1,
        cardPlayed: [card],
        playerColor: ctx.playerColor,
        marbleColor: ctx.playerColor,
        splitFrom: from2,
        splitTo: to2,
        splitType: action2.type,
        ...(owner2 !== ctx.playerColor ? { splitMarbleColor: owner2 } : {}),
    };
}

/**
 * Pour la carte 7 : vrai si ce pion peut être le PREMIER pion d'un coup légal
 * complet. C'est la condition de sélection/surbrillance d'un pion en phase 1
 * (avant tout choix de répartition), à utiliser à la place du simple test
 * « le pion a au moins un pas valide » — lequel met à tort en avant des pions
 * incapables de mener à un coup jouable.
 *
 * Un pion peut « démarrer » le 7 si :
 *   - il peut avancer seul de 7 cases (déplacement simple), OU
 *   - il peut avancer de s ∈ 1..6 ET un AUTRE pion peut terminer les 7-s pas
 *     restants (split légal complet).
 *
 * Si aucun pion ne satisfait cette condition, la carte 7 n'est jouable dans
 * aucune combinaison : tous les pions doivent alors être grisés, comme pour
 * n'importe quelle autre carte injouable.
 */
export function canMarbleStartSeven(
    marblePos: number,
    ctx: LegalMoveContext
): boolean {
    const card: Card = { id: '__7_start__', value: '7', suit: '♠' };
    const validSteps = getValidSevenStepsForMarble(marblePos, ctx);

    // Déplacement simple de 7 cases.
    if (validSteps.includes(7)) return true;

    // Split : ce pion avance de s, un autre pion (contrôlé ou, en 2v2, du
    // coéquipier) termine les 7-s pas restants.
    const candidates = splitSecondMarbleCandidates(ctx);
    for (const s of validSteps) {
        if (s === 7) continue;
        for (const m2 of candidates) {
            if (m2 === marblePos) continue;
            if (getLegalSplit7Action(card, marblePos, s, m2, ctx) !== null) return true;
        }
    }
    return false;
}

/**
 * Pour la carte 7 : cherche un split légal en parcourant toutes les paires
 * ordonnées (m1, m2) de pions du joueur et toutes les répartitions
 * (steps1 ∈ 1..6). Le validateur de `getLegalSplit7Action` rejette déjà les
 * marbles hors main path (`from2`) et les promotions colissantes (le second
 * pion ne peut pas viser la case occupée par le premier après son mouvement).
 * Retourne la première Action composite légale trouvée, ou null.
 */
function findLegalSplit7Action(card: Card, ctx: LegalMoveContext): Action | null {
    const own = ctx.ownMarbles;
    if (own.length === 0) return null;
    const candidates2 = splitSecondMarbleCandidates(ctx);
    for (const m1 of own) {
        for (const m2 of candidates2) {
            if (m1 === m2) continue;
            for (let s = 1; s <= 6; s++) {
                const action = getLegalSplit7Action(card, m1, s, m2, ctx);
                if (action !== null) return action;
            }
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Façade
// ─────────────────────────────────────────────────────────────────────────────

export function findLegalMoveForCard(
    card: Card,
    ctx: LegalMoveContext
): Action | null {
    // Les pions en réserve d'abord : pour les cartes bivalentes (A, K, Joker),
    // l'entrée en jeu prime sur le déplacement — sans ce tri, l'action retournée
    // dépendrait de l'ordre de `ownMarbles`, qui est arbitraire (les indices de
    // `marblePositions` sont écrasés en place au fil de la partie). Neutre pour
    // les autres cartes : un pion en réserve n'a jamais de coup légal avec elles.
    const homePositions = HOME_POSITIONS[ctx.playerColor];
    const marblesEntryFirst = [
        ...ctx.ownMarbles.filter(pos => homePositions.includes(pos)),
        ...ctx.ownMarbles.filter(pos => !homePositions.includes(pos)),
    ];
    for (const marblePos of marblesEntryFirst) {
        const action = getLegalAction(card, marblePos, ctx);
        if (action !== null) return action;
    }
    // 2v2 : un swap légal peut avoir une source qui n'est pas un pion contrôlé
    // (pion du coéquipier échangé contre un adverse, ou pion adverse échangé
    // contre un pion de l'équipe) — donc un swap peut exister même quand aucun
    // pion contrôlé ne peut être la source. (L'échange adverse ↔ adverse reste
    // interdit, filtré dans getLegalAction.)
    if (card.value === 'J' && ctx.teammateColor !== undefined) {
        for (const pos of ctx.allMarbles) {
            if (ctx.ownMarbles.includes(pos)) continue;
            const action = getLegalAction(card, pos, ctx);
            if (action !== null) return action;
        }
    }
    // Cas spécial du 7 : un split (m1 + m2 = 7) reste légal même si aucun
    // pion seul ne peut avancer de 7. Sans cette branche, `canDiscard`
    // proposerait à tort la défausse alors qu'un split est jouable, et
    // inversement empêcherait la défausse uniquement parce qu'un full-7
    // existe — sans considérer si les splits sont eux aussi tous bloqués.
    if (card.value === '7') {
        return findLegalSplit7Action(card, ctx);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mise en jeu solidaire (2v2)
// ─────────────────────────────────────────────────────────────────────────────

/** Vrai si aucune carte de la main n'a de coup légal (défausse normalement forcée). */
export function isHandBlocked(hand: Card[], ctx: LegalMoveContext): boolean {
    return hand.every(card => findLegalMoveForCard(card, ctx) === null);
}

/**
 * Ordre de préférence de la carte jouée pour l'entrée solidaire : on sacrifie
 * d'abord l'As (+1, le déplacement le plus faible des trois), puis le Roi
 * (+13), et le Joker en dernier recours (+18 et rejeu).
 */
const SOLIDAIRE_CARD_PRIORITY = ['A', 'K', 'Joker'] as const;

/**
 * Mise en jeu solidaire (2v2 uniquement) : quand la main du joueur actif est
 * complètement bloquée (il devrait défausser) mais qu'il possède un As, un Roi
 * ou un Joker, que son coéquipier a encore des pions en réserve ET que la case
 * de départ du coéquipier est TOTALEMENT libre (aucun pion d'aucune couleur),
 * le joueur DOIT jouer cette carte pour faire entrer un pion du coéquipier au
 * lieu de se défausser.
 *
 * Retourne l'action `enter` obligatoire, ou null si l'exception ne s'applique
 * pas (mode 1v3, main non bloquée, pas de carte d'entrée, pas de réserve chez
 * le coéquipier, ou case de départ occupée). Après le switch de fin de jeu, le
 * `teammateColor` du contexte désigne le joueur fini : il n'a plus de pion en
 * réserve, l'exception ne se déclenche donc jamais deux fois.
 */
export function findSolidaireEntry(hand: Card[], ctx: LegalMoveContext): Action | null {
    const teammate = ctx.teammateColor;
    if (teammate === undefined) return null;

    const card = SOLIDAIRE_CARD_PRIORITY
        .map(value => hand.find(c => c.value === value))
        .find(c => c !== undefined);
    if (!card) return null;

    const teammateHome = HOME_POSITIONS[teammate];
    const reservePos = ctx.marblesByColor[teammate].find(pos => teammateHome.includes(pos));
    if (reservePos === undefined) return null;

    const startPos = START_POSITIONS[teammate];
    if (ctx.allMarbles.includes(startPos)) return null;

    if (!isHandBlocked(hand, ctx)) return null;

    return {
        type: 'enter',
        from: reservePos,
        to: startPos,
        cardPlayed: [card],
        playerColor: ctx.playerColor,
        marbleColor: teammate,
    };
}
