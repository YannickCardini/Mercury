import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEndGamePointsDeltas } from './points.js';

function deltaOf(deltas: { userId: string; delta: number }[], userId: string) {
    return deltas.find(d => d.userId === userId)!.delta;
}

test('gagnant reçoit +4 points', () => {
    const deltas = computeEndGamePointsDeltas([
        { userId: 'W', points: 1000, isWinner: true },
        { userId: 'L', points: 1000, isWinner: false },
    ]);
    assert.equal(deltaOf(deltas, 'W'), 4);
    assert.equal(deltaOf(deltas, 'L'), -1);
});

test('fonctionne quel que soit l\'écart de points', () => {
    const deltas = computeEndGamePointsDeltas([
        { userId: 'W', points: 100, isWinner: true },
        { userId: 'L', points: 5000, isWinner: false },
    ]);
    assert.equal(deltaOf(deltas, 'W'), 4);
    assert.equal(deltaOf(deltas, 'L'), -1);
});

test('4 joueurs — gagnant +4, perdants -1 chacun', () => {
    const deltas = computeEndGamePointsDeltas([
        { userId: 'W',  points: 1000, isWinner: true  },
        { userId: 'L1', points: 1000, isWinner: false },
        { userId: 'L2', points: 800,  isWinner: false },
        { userId: 'L3', points: 1200, isWinner: false },
    ]);
    assert.equal(deltaOf(deltas, 'W'),   4);
    assert.equal(deltaOf(deltas, 'L1'), -1);
    assert.equal(deltaOf(deltas, 'L2'), -1);
    assert.equal(deltaOf(deltas, 'L3'), -1);
});

test('1 seul humain (vs IA) — gagne +4', () => {
    const deltas = computeEndGamePointsDeltas([
        { userId: 'S', points: 1000, isWinner: true },
    ]);
    assert.equal(deltaOf(deltas, 'S'), 4);
});
