import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BOOST_MULTIPLIER,
    CATALOG_ID_PATTERN,
    FREE_BOOST_SLOTS,
    FREE_REACTION_EMOJIS,
    REACTION_EMOJIS,
    SHOP_CATALOG,
    areOpponents,
    boostMultiplier,
    hasBoost,
    emojiItemId,
    getConsumable,
    getCatalogItem,
    isEmojiUnlocked,
    isFreeEmoji,
    PERFECT_GAME_POINTS,
    perfectGameBonus,
    boostSlotsOf,
    countHomeEntries,
    maxBoostSlots,
    sanitizeLoadout,
    type Action,
} from '@mercury/shared';

test('les ids du catalogue sont uniques', () => {
    const ids = SHOP_CATALOG.map(item => item.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('les ids respectent le motif de désinfection', () => {
    // Ce motif est ce qui sécurise l'interpolation de l'id dans la condition SQL
    // du patch Cosmos (purchaseItem) : une entrée non conforme est une faille.
    for (const item of SHOP_CATALOG) {
        assert.ok(CATALOG_ID_PATTERN.test(item.id), item.id);
    }
});

test('les prix sont des entiers strictement positifs', () => {
    for (const item of SHOP_CATALOG) {
        assert.ok(Number.isInteger(item.price) && item.price > 0, `${item.id} → ${item.price}`);
    }
});

test('chaque emoji du catalogue appartient à la palette', () => {
    for (const item of SHOP_CATALOG) {
        if (item.kind !== 'emoji') continue;
        assert.ok((REACTION_EMOJIS as readonly string[]).includes(item.emoji), item.emoji);
    }
});

test('la palette gratuite est la palette moins les emojis payants', () => {
    const paid = SHOP_CATALOG.filter(item => item.kind === 'emoji').map(item => item.emoji);
    assert.equal(FREE_REACTION_EMOJIS.length, REACTION_EMOJIS.length - paid.length);
    for (const emoji of paid) {
        assert.ok(!(FREE_REACTION_EMOJIS as readonly string[]).includes(emoji), emoji);
    }
});

test('isFreeEmoji distingue historique et boutique', () => {
    assert.equal(isFreeEmoji('👏'), true);
    assert.equal(isFreeEmoji('😉'), false);
});

test('emojiItemId ne répond que pour les emojis payants', () => {
    assert.equal(emojiItemId('😉'), 'emoji.wink');
    assert.equal(emojiItemId('👏'), undefined);
});

test('getCatalogItem ignore un id inconnu', () => {
    assert.equal(getCatalogItem('emoji.nope'), undefined);
    assert.equal(getCatalogItem('emoji.wink')?.price, 50);
});

test('isEmojiUnlocked : gratuit toujours, payant seulement si possédé', () => {
    assert.equal(isEmojiUnlocked('👏', []), true);
    assert.equal(isEmojiUnlocked('😉', []), false);
    assert.equal(isEmojiUnlocked('😉', ['emoji.wink']), true);
});

test('isEmojiUnlocked accepte indifféremment un Set ou un tableau', () => {
    assert.equal(isEmojiUnlocked('😘', new Set(['emoji.kissing'])), true);
    assert.equal(isEmojiUnlocked('😘', new Set(['emoji.wink'])), false);
});

test('seuls les six emojis historiques restent gratuits', () => {
    assert.deepEqual([...FREE_REACTION_EMOJIS], ['👏', '😂', '😮', '😥', '🔥', '🤔']);
});

test('prix particuliers : ⏰ à 60, 🦧 à 80', () => {
    assert.equal(getCatalogItem('emoji.alarm')?.price, 60);
    assert.equal(getCatalogItem('emoji.orangutan')?.price, 80);
});

test('prix des boosters permanents (décision du 2026-10-23)', () => {
    const consumables = SHOP_CATALOG.filter(item => item.kind === 'consumable');
    assert.deepEqual(
        consumables.map(item => [item.id, item.price]),
        [
            ['consumable.double_points', 250],
            ['consumable.double_coins', 200],
            ['consumable.bounty', 50],
            ['consumable.homecoming', 80],
            ['consumable.double_strike', 80],
            ['consumable.perfect_game', 30],
        ],
    );
});

test('hasBoost reconnaît Bounty, boostMultiplier ne le confond pas avec un doublement', () => {
    assert.equal(hasBoost(['consumable.bounty'], 'capture_coins'), true);
    assert.equal(hasBoost(['consumable.double_coins'], 'capture_coins'), false);
    assert.equal(boostMultiplier(['consumable.bounty'], 'double_coins'), 1);
});

test('areOpponents : seule l\'équipe d\'en face compte', () => {
    assert.equal(areOpponents('red', 'blue'), false); // coéquipiers
    assert.equal(areOpponents('red', 'green'), true);
    assert.equal(areOpponents('red', 'orange'), true);
    assert.equal(areOpponents('red', 'red'), false);
});

test('getConsumable ne répond que pour un booster', () => {
    assert.equal(getConsumable('consumable.double_coins')?.effect, 'double_coins');
    assert.equal(getConsumable('emoji.wink'), undefined);
    assert.equal(getConsumable('consumable.nope'), undefined);
});

test('boostMultiplier : x2 seulement pour l\'effet du booster actif', () => {
    assert.equal(BOOST_MULTIPLIER, 2);
    assert.equal(boostMultiplier(['consumable.double_points'], 'double_points'), 2);
    assert.equal(boostMultiplier(['consumable.double_points'], 'double_coins'), 1);
    assert.equal(boostMultiplier([], 'double_coins'), 1);
    assert.equal(boostMultiplier(undefined, 'double_points'), 1);
    // Un id inconnu (snapshot ancien, document falsifié) n'active rien.
    assert.equal(boostMultiplier(['consumable.triple'], 'double_points'), 1);
});

// ── Équipement des boosters ───────────────────────────────────────────────────

const ALL_BOOSTS = [
    'consumable.double_points',
    'consumable.double_coins',
    'consumable.bounty',
    'consumable.homecoming',
    'consumable.double_strike',
    'consumable.perfect_game',
];

test('sanitizeLoadout garde les boosters possédés, dans l\'ordre des emplacements', () => {
    assert.deepEqual(
        sanitizeLoadout(['consumable.bounty', 'consumable.double_coins'], ALL_BOOSTS, 2),
        ['consumable.bounty', 'consumable.double_coins'],
    );
});

test('sanitizeLoadout écarte un booster non possédé, un emoji, un id inconnu et un doublon', () => {
    const owned = new Set(['consumable.bounty', 'emoji.wink']);
    assert.deepEqual(
        sanitizeLoadout(
            ['consumable.double_coins', 'emoji.wink', 'consumable.nope', 'consumable.bounty', 'consumable.bounty'],
            owned,
            5,
        ),
        ['consumable.bounty'],
    );
});

test('sanitizeLoadout plafonne aux emplacements du joueur', () => {
    assert.equal(sanitizeLoadout(ALL_BOOSTS, ALL_BOOSTS, 2).length, 2);
    assert.equal(sanitizeLoadout(ALL_BOOSTS, ALL_BOOSTS, 4).length, 4);
    assert.deepEqual(sanitizeLoadout(undefined, ALL_BOOSTS, 3), []);
});

test('emplacements : 2 offerts, au plus de quoi équiper tout le catalogue', () => {
    assert.equal(FREE_BOOST_SLOTS, 2);
    assert.equal(maxBoostSlots(), ALL_BOOSTS.length);
    assert.equal(boostSlotsOf(undefined), FREE_BOOST_SLOTS);
    assert.equal(boostSlotsOf(0), FREE_BOOST_SLOTS);
    assert.equal(boostSlotsOf(4), 4);
    assert.equal(boostSlotsOf(99), maxBoostSlots());
    assert.equal(boostSlotsOf(2.5), FREE_BOOST_SLOTS);
});

// ── Coups doubles ─────────────────────────────────────────────────────────────

// Rouge : couloir d'arrivée 38, 53, 68, 83 ; coéquipier bleu : 188, 173, 158, 143.
const seven = (fields: Partial<Action>): Action => ({
    type: 'move',
    from: 0,
    to: 0,
    cardPlayed: null,
    playerColor: 'red',
    ...fields,
});

test('countHomeEntries : deux pions rentrés par un 7 partagé', () => {
    assert.equal(countHomeEntries(seven({ from: 23, to: 38, splitFrom: 22, splitTo: 53 })), 2);
});

test('countHomeEntries : le second pion peut être celui du coéquipier', () => {
    assert.equal(
        countHomeEntries(seven({ from: 23, to: 38, splitFrom: 200, splitTo: 188, splitMarbleColor: 'blue' })),
        2,
    );
});

test('countHomeEntries : avancer dans le couloir ne compte pas comme rentrer', () => {
    assert.equal(countHomeEntries(seven({ from: 38, to: 68, splitFrom: 23, splitTo: 53 })), 1);
    assert.equal(countHomeEntries(seven({ from: 23, to: 24 })), 0);
});

test('countHomeEntries : une case d\'arrivée d\'une autre couleur ne compte pas', () => {
    // 188 est l'arrivée de bleu, pas de rouge.
    assert.equal(countHomeEntries(seven({ from: 23, to: 188 })), 0);
});

// ── Partie parfaite ───────────────────────────────────────────────────────────

const PERFECT = ['consumable.perfect_game'];

test('perfectGameBonus : victoire sans pion adverse rentré, booster équipé', () => {
    assert.equal(PERFECT_GAME_POINTS, 100);
    assert.equal(perfectGameBonus(PERFECT, true, 0, false), 100);
});

test('perfectGameBonus : rien pour une défaite, un pion adverse rentré ou un abandon', () => {
    assert.equal(perfectGameBonus(PERFECT, false, 0, false), 0);
    assert.equal(perfectGameBonus(PERFECT, true, 1, false), 0);
    assert.equal(perfectGameBonus(PERFECT, true, 0, true), 0);
});

test('perfectGameBonus : rien sans le booster', () => {
    assert.equal(perfectGameBonus(['consumable.double_points'], true, 0, false), 0);
    assert.equal(perfectGameBonus(undefined, true, 0, false), 0);
});
