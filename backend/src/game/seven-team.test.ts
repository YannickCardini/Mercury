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

test('7 (2v2) — quand le premier pion atterrit sur la position ACTUELLE du second, ce n\'est pas une capture : le second bouge aussi (bug prod)', () => {
    // Bug de prod : red en 10 avec un 7, coéquipier blue exactement 1 case
    // devant (25). Sélectionner le split 1+6 doit rester jouable pour
    // promouvoir blue — red se contente d'avancer dans la case que blue
    // quitte dans le cadre du MÊME coup, ce n'est pas une capture.
    const marbles = { ...emptyByColor(), red: [10], blue: [25] };
    const ctx = buildTeamCtx('red', marbles);
    const action = getLegalSplit7Action(SEVEN, 10, 1, 25, ctx);
    assert.notEqual(action, null, 'le split doit rester légal même si to1 === from2');
    assert.equal(action!.to, 25);
    assert.equal(action!.type, 'move', 'pas une capture : blue quitte la case dans le même coup');
    assert.equal(action!.splitFrom, 25);
    assert.equal(action!.splitTo, 87);
    assert.equal(action!.splitType, 'move');
    assert.equal(action!.splitMarbleColor, 'blue');
});

test('7 (2v2) — les deux moitiés du split ne peuvent pas atterrir sur la même case', () => {
    // Red en 10 (MAIN_PATH[1]) et blue en 7 (MAIN_PATH[54]) : avec 2+5, les
    // deux pions convergent sur 40 (MAIN_PATH[3]) — un vrai chevauchement de
    // destinations, distinct du cas to1===from2 corrigé ci-dessus.
    const marbles = { ...emptyByColor(), red: [10], blue: [7] };
    const ctx = buildTeamCtx('red', marbles);
    assert.equal(getLegalSplit7Action(SEVEN, 10, 2, 7, ctx), null, 'to1 === to2 doit rester illégal');
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
