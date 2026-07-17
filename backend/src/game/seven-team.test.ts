// ─────────────────────────────────────────────────────────────────────────────
// Tests du 7 en mode équipes 2v2 : le joueur actif doit bouger un de SES pions
// en premier, puis peut utiliser les points restants sur un pion de son
// coéquipier. Le second pion promeut dans les arrivées de SON propriétaire.
//
// Rappels géométrie (MAIN_PATH) : 9→10→25→40→55→70→85→86→87→88→89→90→105→120…
// et …220→219→218→217(start blue)→216… ; arrivées blue = [188,173,158,143].
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getLegalSplit7Action,
    getTeammateColor,
    ARRIVAL_POSITIONS,
    type LegalMoveContext,
} from '@mercury/shared';
import type { Card, MarbleColor } from '@mercury/shared';

const SEVEN: Card = { id: 'test-7', value: '7', suit: '♠' };

function emptyByColor(): Record<MarbleColor, number[]> {
    return { red: [], green: [], blue: [], orange: [] };
}

function buildTeamCtx(
    ownColor: MarbleColor,
    marblesByColor: Record<MarbleColor, number[]>,
): LegalMoveContext {
    return {
        ownMarbles: [...marblesByColor[ownColor]],
        allMarbles: Object.values(marblesByColor).flat(),
        playerColor: ownColor,
        marblesByColor,
        invincibleMarblesByColor: emptyByColor(),
        teammateColor: getTeammateColor(ownColor),
    };
}

test('7 (2v2) — split own + coéquipier légal : red bouge 1, le pion blue avance de 6', () => {
    const marbles = { ...emptyByColor(), red: [10], blue: [86] };
    const ctx = buildTeamCtx('red', marbles);
    const action = getLegalSplit7Action(SEVEN, 10, 1, 86, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.from, 10);
    assert.equal(action!.to, 25);
    assert.equal(action!.splitFrom, 86);
    assert.equal(action!.splitTo, 120);
    assert.equal(action!.marbleColor, 'red');
    assert.equal(action!.splitMarbleColor, 'blue', 'le second pion appartient au coéquipier');
});

test('7 (2v2) — commencer par le pion du coéquipier est ILLÉGAL (own d\'abord)', () => {
    const marbles = { ...emptyByColor(), red: [10], blue: [86] };
    const ctx = buildTeamCtx('red', marbles);
    assert.equal(getLegalSplit7Action(SEVEN, 86, 1, 10, ctx), null);
});

test('7 (2v2) — le pion du coéquipier promeut dans SES arrivées, pas celles du joueur actif', () => {
    // Blue en 220 : 3 pas jusqu'à son start (217) + 3 arrivées à franchir = 6 pas → promote.
    const marbles = { ...emptyByColor(), red: [10], blue: [220] };
    const ctx = buildTeamCtx('red', marbles);
    const action = getLegalSplit7Action(SEVEN, 10, 1, 220, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.splitType, 'promote');
    assert.ok(
        ARRIVAL_POSITIONS.blue.includes(action!.splitTo!),
        `splitTo (${action!.splitTo}) doit être une arrivée BLUE`
    );
    assert.equal(action!.splitMarbleColor, 'blue');
});

test('7 (2v2) — le second pion promeut même si un pion invincible de sa couleur occupe son start', () => {
    // Scénario du bug : un pion blue vient d'entrer (invincible sur 217), un
    // autre pion blue en 220 doit quand même pouvoir promouvoir (3 pas
    // jusqu'au start + 3 arrivées = 6 pas) — le start est le point de
    // bifurcation vers les arrivées, il n'est pas traversé.
    const marbles = { ...emptyByColor(), red: [10], blue: [220, 217] };
    const ctx: LegalMoveContext = {
        ...buildTeamCtx('red', marbles),
        invincibleMarblesByColor: { ...emptyByColor(), blue: [217] },
    };
    const action = getLegalSplit7Action(SEVEN, 10, 1, 220, ctx);
    assert.notEqual(action, null, 'le pion invincible sur son propre start ne doit pas bloquer la promotion');
    assert.equal(action!.splitType, 'promote');
    assert.equal(action!.splitTo, 143);
});

test('7 (2v2) — le second pion peut capturer un pion de sa propre équipe (pas d\'immunité)', () => {
    // Red bouge 10→55 (3 pas), puis blue 86 avance de 4 → 90, occupé par l'autre pion red.
    const marbles = { ...emptyByColor(), red: [10, 90], blue: [86] };
    const ctx = buildTeamCtx('red', marbles);
    const action = getLegalSplit7Action(SEVEN, 10, 3, 86, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.to, 55);
    assert.equal(action!.splitTo, 90);
    assert.equal(action!.splitType, 'capture', 'atterrir sur un pion allié le capture');
});

test('7 (2v2) — un pion capturé par le premier mouvement ne peut pas être le second pion', () => {
    // Red 10 → 25 capture le pion blue en 25 : ce pion (renvoyé en réserve)
    // ne peut pas servir de second pion au split.
    const marbles = { ...emptyByColor(), red: [10], blue: [25] };
    const ctx = buildTeamCtx('red', marbles);
    assert.equal(getLegalSplit7Action(SEVEN, 10, 1, 25, ctx), null);
});

test('7 (1v3) — le split reste limité aux pions propres (pas de teammateColor)', () => {
    const marbles = { ...emptyByColor(), red: [10], blue: [86] };
    const ctx: LegalMoveContext = {
        ownMarbles: [10],
        allMarbles: [10, 86],
        playerColor: 'red',
        marblesByColor: marbles,
        invincibleMarblesByColor: emptyByColor(),
    };
    assert.equal(getLegalSplit7Action(SEVEN, 10, 1, 86, ctx), null);
});
