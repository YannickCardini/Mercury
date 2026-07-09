// ─────────────────────────────────────────────────────────────────────────────
// Tests du Valet (J) en mode équipes 2v2 : échange de n'importe quelle paire
// de pions de couleurs différentes — le pion du joueur actif n'a plus besoin
// d'être impliqué. En 1v3 (ctx sans teammateColor), comportement historique :
// la source doit appartenir au joueur actif.
//
// Vérifie aussi la garde de propriété ajoutée à getLegalAction pour les autres
// cartes (un client ne peut plus jouer un pion qui ne lui appartient pas).
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getLegalAction,
    findLegalMoveForCard,
    getTeammateColor,
    HOME_POSITIONS,
    START_POSITIONS,
    type LegalMoveContext,
} from '@mercury/shared';
import type { Card, MarbleColor } from '@mercury/shared';

const JACK: Card = { id: 'test-J', value: 'J', suit: '♠' };
const QUEEN: Card = { id: 'test-Q', value: 'Q', suit: '♠' };

function emptyByColor(): Record<MarbleColor, number[]> {
    return { red: [], green: [], blue: [], orange: [] };
}

function buildCtx(
    ownColor: MarbleColor,
    marblesByColor: Record<MarbleColor, number[]>,
    opts: { teamMode?: boolean; invincible?: Record<MarbleColor, number[]> } = {},
): LegalMoveContext {
    return {
        ownMarbles: [...marblesByColor[ownColor]],
        allMarbles: Object.values(marblesByColor).flat(),
        playerColor: ownColor,
        marblesByColor,
        invincibleMarblesByColor: opts.invincible ?? emptyByColor(),
        ...(opts.teamMode ? { teammateColor: getTeammateColor(ownColor) } : {}),
    };
}

test('J (2v2) — échange deux pions étrangers de couleurs différentes, sans pion du joueur actif', () => {
    // Rouge joue le Valet ; green en 10 et orange en 25, aucun pion rouge sur le chemin.
    const marbles = { ...emptyByColor(), red: [...HOME_POSITIONS.red], green: [10], orange: [25] };
    const ctx = buildCtx('red', marbles, { teamMode: true });
    const action = getLegalAction(JACK, 10, ctx, 25);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'swap');
    assert.equal(action!.from, 10);
    assert.equal(action!.to, 25);
    assert.equal(action!.marbleColor, 'green', 'marbleColor = couleur du pion source');
    assert.equal(action!.playerColor, 'red', 'playerColor = joueur qui a joué la carte');
});

test('J (2v2) — deux pions de MÊME couleur ne peuvent pas être échangés', () => {
    const marbles = { ...emptyByColor(), red: [...HOME_POSITIONS.red], green: [10, 25] };
    const ctx = buildCtx('red', marbles, { teamMode: true });
    assert.equal(getLegalAction(JACK, 10, ctx, 25), null);
});

test('J (2v2) — un pion invincible (pieu) reste protégé, comme source et comme cible', () => {
    // Orange fraîchement entré sur son start (91) = invincible.
    const marbles = { ...emptyByColor(), green: [10], orange: [START_POSITIONS.orange] };
    const invincible = { ...emptyByColor(), orange: [START_POSITIONS.orange] };
    const ctx = buildCtx('red', { ...marbles, red: [...HOME_POSITIONS.red] }, { teamMode: true, invincible });
    assert.equal(getLegalAction(JACK, 10, ctx, START_POSITIONS.orange), null, 'cible invincible refusée');
    assert.equal(getLegalAction(JACK, START_POSITIONS.orange, ctx), null, 'source invincible refusée');
});

test('J (1v3) — comportement historique : la source doit appartenir au joueur actif', () => {
    const marbles = { ...emptyByColor(), red: [10], green: [25] };
    const ctx = buildCtx('red', marbles);
    // Source adverse → refusé en 1v3
    assert.equal(getLegalAction(JACK, 25, ctx, 10), null);
    // Source propre → OK
    const action = getLegalAction(JACK, 10, ctx, 25);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'swap');
    assert.equal(action!.marbleColor, 'red');
});

test('findLegalMoveForCard(J) — 2v2 : un swap ennemi↔ennemi existe même sans source propre (canDiscard doit le voir)', () => {
    // Tous les pions rouges en réserve : aucune source propre possible.
    const marbles = { ...emptyByColor(), red: [...HOME_POSITIONS.red], green: [10], orange: [25] };
    const teamCtx = buildCtx('red', marbles, { teamMode: true });
    assert.notEqual(findLegalMoveForCard(JACK, teamCtx), null, '2v2 : swap green↔orange trouvé');

    const soloCtx = buildCtx('red', marbles);
    assert.equal(findLegalMoveForCard(JACK, soloCtx), null, '1v3 : aucun coup (source propre requise)');
});

test('garde de propriété — une carte de déplacement ne peut pas jouer le pion d\'un autre joueur', () => {
    const marbles = { ...emptyByColor(), red: [10], green: [25] };
    // L'exploit historique : envoyer `from` = pion adverse avec une carte de déplacement.
    assert.equal(getLegalAction(QUEEN, 25, buildCtx('red', marbles)), null, '1v3');
    assert.equal(getLegalAction(QUEEN, 25, buildCtx('red', marbles, { teamMode: true })), null, '2v2');
    // Le pion propre reste jouable normalement.
    assert.notEqual(getLegalAction(QUEEN, 10, buildCtx('red', marbles)), null);
});
