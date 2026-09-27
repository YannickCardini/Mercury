import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEndGameCoins, computeWinCoins } from './coins.js';
import { MAX_COINS_PER_WIN, MIN_COINS_PER_WIN } from '@mercury/shared';

test('2v2 — écart de pions rentrés (cas de référence : 8 contre 6)', () => {
    assert.equal(computeWinCoins(8, 6), 2);
});

test('2v2 — adversaires à zéro : gain maximal', () => {
    assert.equal(computeWinCoins(8, 0), MAX_COINS_PER_WIN);
});

test('2v2 — adversaires à 7 pions : gain minimal, jamais nul', () => {
    assert.equal(computeWinCoins(8, 7), 1);
});

test('victoire par forfait — écart nul ou négatif ramené au plancher', () => {
    assert.equal(computeWinCoins(2, 2), MIN_COINS_PER_WIN);
    assert.equal(computeWinCoins(1, 6), MIN_COINS_PER_WIN);
});

test('le gain est toujours borné', () => {
    for (let winners = 0; winners <= 8; winners++) {
        for (let losers = 0; losers <= 8; losers++) {
            const coins = computeWinCoins(winners, losers);
            assert.ok(coins >= MIN_COINS_PER_WIN && coins <= MAX_COINS_PER_WIN, `${winners}/${losers} → ${coins}`);
        }
    }
});

test('Bounty seul — perdant payé pour ses captures', () => {
    assert.equal(computeEndGameCoins(0, 3, 1), 3);
});

test('Double Coins double aussi la prime Bounty', () => {
    // Victoire à 8 contre 6 (2 pièces) + 3 captures, le tout doublé.
    assert.equal(computeEndGameCoins(2, 3, 2), 10);
});

test('Double Coins sans rien à doubler : zéro', () => {
    assert.equal(computeEndGameCoins(0, 0, 2), 0);
});
