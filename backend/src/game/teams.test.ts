// ─────────────────────────────────────────────────────────────────────────────
// Tests du mode équipes 2v2 : mapping des équipes, victoire d'équipe (ET
// logique), switch de fin de jeu (getControlledColor), et points de fin de
// partie avec deux gagnants.
//
// Équipes fixes : red+blue vs green+orange (sièges 1&3 vs 2&4).
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getTeammateColor,
    sameTeam,
    hasTeamWon,
    getControlledColor,
    ARRIVAL_POSITIONS,
    HOME_POSITIONS,
} from '@mercury/shared';
import type { MarbleColor } from '@mercury/shared';
import { computeEndGamePointsDeltas } from './points.js';

function emptyByColor(): Record<MarbleColor, number[]> {
    return { red: [], green: [], blue: [], orange: [] };
}

test('getTeammateColor — red↔blue et green↔orange', () => {
    assert.equal(getTeammateColor('red'), 'blue');
    assert.equal(getTeammateColor('blue'), 'red');
    assert.equal(getTeammateColor('green'), 'orange');
    assert.equal(getTeammateColor('orange'), 'green');
});

test('sameTeam — coéquipiers et soi-même, jamais l\'équipe adverse', () => {
    assert.ok(sameTeam('red', 'blue'));
    assert.ok(sameTeam('blue', 'red'));
    assert.ok(sameTeam('red', 'red'));
    assert.ok(sameTeam('orange', 'green'));
    assert.ok(!sameTeam('red', 'green'));
    assert.ok(!sameTeam('blue', 'orange'));
});

test('hasTeamWon — vrai seulement quand LES DEUX coéquipiers ont leurs 4 pions à l\'abri', () => {
    const marbles = {
        ...emptyByColor(),
        red: [...ARRIVAL_POSITIONS.red],
        blue: [...ARRIVAL_POSITIONS.blue],
        green: [...HOME_POSITIONS.green],
        orange: [...HOME_POSITIONS.orange],
    };
    assert.ok(hasTeamWon(marbles, 'red'));
    assert.ok(hasTeamWon(marbles, 'blue'), 'symétrique pour l\'autre membre de l\'équipe');
    assert.ok(!hasTeamWon(marbles, 'green'));

    // Un seul membre fini → l'équipe n'a PAS gagné (le OU historique devient un ET)
    const partial = { ...marbles, blue: [217, ...ARRIVAL_POSITIONS.blue.slice(1)] };
    assert.ok(!hasTeamWon(partial, 'red'));
    assert.ok(!hasTeamWon(partial, 'blue'));
});

test('getControlledColor — un joueur fini contrôle les pions de son coéquipier', () => {
    // Rouge a fini → il contrôle les pions de bleu
    assert.equal(getControlledColor('red', [...ARRIVAL_POSITIONS.red]), 'blue');
    // Rouge en cours de partie → il contrôle ses propres pions
    assert.equal(getControlledColor('red', [9, 25, ...ARRIVAL_POSITIONS.red.slice(2)]), 'red');
    assert.equal(getControlledColor('green', [...ARRIVAL_POSITIONS.green]), 'orange');
});

test('computeEndGamePointsDeltas — deux gagnants (équipe) : +4/+4, perdants -1/-1', () => {
    const deltas = computeEndGamePointsDeltas([
        { userId: 'u-red', points: 1000, isWinner: true },
        { userId: 'u-green', points: 1200, isWinner: false },
        { userId: 'u-blue', points: 900, isWinner: true },
        { userId: 'u-orange', points: 1100, isWinner: false },
    ]);
    assert.deepEqual(deltas, [
        { userId: 'u-red', delta: 4 },
        { userId: 'u-green', delta: -1 },
        { userId: 'u-blue', delta: 4 },
        { userId: 'u-orange', delta: -1 },
    ]);
});
