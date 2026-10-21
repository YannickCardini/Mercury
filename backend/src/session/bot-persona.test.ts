// ─────────────────────────────────────────────────────────────────────────────
// Personas d'agents IA : tirage d'un nouveau bot (quotas sur le pool existant),
// traits imposés, validation à la lecture.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FREE_EMOJIS, PAID_EMOJIS, STYLE_TIERS, OWNERSHIP_TIERS,
    buildPersona, ownershipOf, parsePersona, personaItemIds, personaProblem, quotaPick,
    type BotPersona,
} from './bot-persona.js';
import { seededRng } from './matchmaking-script.js';

test('persona — palette dérivée du catalogue : 6 gratuits, 9 de boutique', () => {
    assert.equal(FREE_EMOJIS.length, 6);
    assert.equal(PAID_EMOJIS.length, 9);
});

test('persona — tirée sans contrainte : toujours valide', () => {
    for (let seed = 1; seed <= 2_000; seed++) {
        const p = buildPersona({}, [], seededRng(seed));
        assert.equal(personaProblem(p), null);
        assert.ok(p.owned.length <= 6);
    }
});

test('persona — les quotas rééquilibrent le pool', () => {
    const rng = seededRng(4);
    const pool: BotPersona[] = [];
    for (let i = 0; i < 40; i++) pool.push(buildPersona({}, pool, rng));
    for (const tier of STYLE_TIERS) {
        const count = pool.filter(p => p.style === tier.name).length;
        assert.ok(Math.abs(count - tier.share * pool.length) <= 1, `${tier.name} : ${count}`);
    }
    for (const tier of OWNERSHIP_TIERS) {
        const count = pool.filter(p => ownershipOf(p) === tier.name).length;
        assert.ok(Math.abs(count - tier.share * pool.length) <= 1, `${tier.name} : ${count}`);
    }
});

test('persona — quotaPick choisit le palier le plus en manque', () => {
    const existing = Array<'silent' | 'quiet' | 'normal' | 'chatty'>(10).fill('quiet');
    assert.notEqual(quotaPick(STYLE_TIERS, existing, seededRng(1)), 'quiet');
});

test('persona — traits imposés gardés tels quels', () => {
    const p = buildPersona({ style: 'quiet', owned: ['😎', '⏰'], favorite: '😎', pace: 0.8 }, [], seededRng(2));
    assert.deepEqual(p, { style: 'quiet', chattiness: 0.5, owned: ['😎', '⏰'], favorite: '😎', pace: 0.8 });
    assert.deepEqual(personaItemIds(p), ['emoji.cool', 'emoji.alarm']);
    assert.equal(buildPersona({ favorite: null }, [], seededRng(3)).favorite, null);
});

test('persona — traits imposés incohérents refusés', () => {
    assert.throws(() => buildPersona({ owned: ['👏'] }, [], seededRng(1)), /boutique/);
    assert.throws(() => buildPersona({ owned: [], favorite: '😎' }, [], seededRng(1)), /fétiche/);
    assert.throws(() => buildPersona({ pace: 3 }, [], seededRng(1)), /pace/);
});

test('persona — lecture tolérante d\'un document', () => {
    const ok = { style: 'chatty', chattiness: 2, owned: ['🦧'], favorite: '🦧', pace: 1.1 };
    assert.deepEqual(parsePersona(ok), ok);
    assert.deepEqual(parsePersona({ ...ok, favorite: undefined }), { ...ok, favorite: null });
    assert.equal(parsePersona(undefined), null);
    assert.equal(parsePersona({ ...ok, style: 'loud' }), null);
    assert.equal(parsePersona({ ...ok, owned: ['💩'] }), null);
    assert.equal(parsePersona({ ...ok, owned: 'nope' }), null);
});
