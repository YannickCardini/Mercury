import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEndGamePointsDeltas } from './points.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function twoPlayer(winnerPts: number, loserPts: number) {
    return computeEndGamePointsDeltas([
        { userId: 'W', points: winnerPts, isWinner: true },
        { userId: 'L', points: loserPts,  isWinner: false },
    ]);
}

function deltaOf(deltas: { userId: string; delta: number }[], userId: string) {
    return deltas.find(d => d.userId === userId)!.delta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Swing ≈ 3 at equal ratings
// ─────────────────────────────────────────────────────────────────────────────

test('swing ≈ 3 — 2 joueurs à égalité de points', () => {
    const deltas = twoPlayer(1000, 1000);
    assert.equal(deltaOf(deltas, 'W'), 3);
    assert.equal(deltaOf(deltas, 'L'), -3);
});

test('swing ≈ 3 — 4 joueurs tous à égalité de points', () => {
    const deltas = computeEndGamePointsDeltas([
        { userId: 'W',  points: 1000, isWinner: true  },
        { userId: 'L1', points: 1000, isWinner: false },
        { userId: 'L2', points: 1000, isWinner: false },
        { userId: 'L3', points: 1000, isWinner: false },
    ]);
    assert.equal(deltaOf(deltas, 'W'),  3);
    assert.equal(deltaOf(deltas, 'L1'), -3);
    assert.equal(deltaOf(deltas, 'L2'), -3);
    assert.equal(deltaOf(deltas, 'L3'), -3);
});

// ─────────────────────────────────────────────────────────────────────────────
// Progression logarithmique 4 → 5 → 6 selon l'écart
// Toutes les assertions portent sur le cas "joueur faible gagne" (upset) car
// c'est là que l'écart se voit le mieux, et sur le pendant "joueur fort perd".
// ─────────────────────────────────────────────────────────────────────────────

test('swing ≈ 4 — écart ~150 pts : faible (850) bat fort (1000)', () => {
    // expected(850 vs 1000) = 1/(1+10^(150/400)) ≈ 0.297 → gain = round(6*0.703) = 4
    const deltas = twoPlayer(850, 1000);
    assert.equal(deltaOf(deltas, 'W'), 4, 'joueur faible qui gagne récupère 4');
    assert.equal(deltaOf(deltas, 'L'), -4, 'joueur fort qui perd perd 4');
});

test('swing ≈ 5 — écart ~300 pts : faible (700) bat fort (1000)', () => {
    // expected(700 vs 1000) = 1/(1+10^(300/400)) ≈ 0.151 → gain = round(6*0.849) = 5
    const deltas = twoPlayer(700, 1000);
    assert.equal(deltaOf(deltas, 'W'), 5, 'joueur faible qui gagne récupère 5');
    assert.equal(deltaOf(deltas, 'L'), -5, 'joueur fort qui perd perd 5');
});

test('swing ≈ 6 — écart ~600 pts : faible (400) bat fort (1000)', () => {
    // expected(400 vs 1000) = 1/(1+10^(600/400)) ≈ 0.031 → gain = round(6*0.969) ≈ 6
    const deltas = twoPlayer(400, 1000);
    assert.equal(deltaOf(deltas, 'W'), 6, 'joueur faible qui gagne récupère 6 (max)');
    assert.equal(deltaOf(deltas, 'L'), -6, 'joueur fort qui perd perd 6 (max)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Direction — récompense de l'upset
// ─────────────────────────────────────────────────────────────────────────────

test('direction — le faible qui gagne récupère plus que le fort qui gagne (même écart)', () => {
    // Upset (850 bat 1000) : le gagnant faible récupère plus
    const upset = twoPlayer(850, 1000);
    // Favori (1000 bat 850) : le gagnant fort récupère moins
    const normal = twoPlayer(1000, 850);
    assert.ok(
        deltaOf(upset, 'W') > deltaOf(normal, 'W'),
        `upset gain (${deltaOf(upset, 'W')}) doit être > favori gain (${deltaOf(normal, 'W')})`,
    );
});

test('direction — le fort qui perd perd plus que le faible qui perd (même écart)', () => {
    // Fort (1000) perd contre le faible (850)
    const upset = twoPlayer(850, 1000);
    // Faible (850) perd contre le fort (1000)
    const normal = twoPlayer(1000, 850);
    assert.ok(
        deltaOf(upset, 'L') < deltaOf(normal, 'L'),
        `fort qui perd (${deltaOf(upset, 'L')}) doit perdre plus que faible qui perd (${deltaOf(normal, 'L')})`,
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Cas limites
// ─────────────────────────────────────────────────────────────────────────────

test('floor — 1 seul humain (vs 0 adversaire humain) : gagne au moins 1 pt', () => {
    const deltas = computeEndGamePointsDeltas([
        { userId: 'S', points: 1000, isWinner: true },
    ]);
    assert.equal(deltaOf(deltas, 'S'), 3); // neutre (opponent avg = own rating)
});

test('plancher — le gagnant gagne toujours ≥ 1 pt même favori écrasant', () => {
    // Fort (10 000) bat faible (100) : expected ≈ 1, gain ≈ 0 → clampé à 1
    const deltas = twoPlayer(10_000, 100);
    assert.ok(deltaOf(deltas, 'W') >= 1, 'gain minimum = 1');
    assert.ok(deltaOf(deltas, 'L') <= -1, 'perte minimum = -1');
});
