import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCoinParts, computeWinCoins, emptyTally, type SeatTally } from './coins.js';
import { endGameCoinDelta } from '@mercury/shared';
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

const BOUNTY = ['consumable.bounty'];
const tally = (t: Partial<SeatTally>): SeatTally => ({ ...emptyTally(), ...t });

test('Bounty seul — perdant payé pour ses captures', () => {
    const parts = computeCoinParts(0, tally({ captures: 3 }), BOUNTY);
    assert.equal(endGameCoinDelta(parts, 1), 3);
});

test('Double Coins double aussi la prime Bounty', () => {
    // Victoire à 8 contre 6 (2 pièces) + 3 captures, le tout doublé.
    const parts = computeCoinParts(2, tally({ captures: 3 }), BOUNTY);
    assert.equal(endGameCoinDelta(parts, 2), 10);
});

test('Double Coins sans rien à doubler : zéro', () => {
    assert.equal(endGameCoinDelta(computeCoinParts(0, emptyTally(), []), 2), 0);
});

test('malus Bounty : -1 par pion de son camp, jamais doublé, peut rendre la partie négative', () => {
    const parts = computeCoinParts(0, tally({ captures: 1, allyCaptures: 3 }), BOUNTY);
    assert.equal(parts.allyPenalty, 3);
    assert.equal(endGameCoinDelta(parts, 1), -2);
    // Double Coins double le gain (1 → 2), pas le malus (3).
    assert.equal(endGameCoinDelta(parts, 2), -1);
});

test('sans Bounty, les captures ne rapportent ni ne coûtent rien', () => {
    const parts = computeCoinParts(4, tally({ captures: 5, allyCaptures: 5 }), []);
    assert.equal(endGameCoinDelta(parts, 1), 4);
});

test('Homecoming et Double Strike : +50 par coup double, doublés par Double Coins', () => {
    const boosts = ['consumable.homecoming', 'consumable.double_strike'];
    const parts = computeCoinParts(2, tally({ pairHomes: 1, pairCaptures: 2 }), boosts);
    assert.equal(parts.pairHome, 50);
    assert.equal(parts.pairCapture, 100);
    assert.equal(endGameCoinDelta(parts, 2), (2 + 50 + 100) * 2);
});

test('un coup double ne paie que si son booster est équipé', () => {
    const parts = computeCoinParts(0, tally({ pairHomes: 2, pairCaptures: 2 }), ['consumable.homecoming']);
    assert.equal(parts.pairHome, 100);
    assert.equal(parts.pairCapture, 0);
});
