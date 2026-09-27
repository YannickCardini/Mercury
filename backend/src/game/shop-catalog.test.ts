import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BOOST_MULTIPLIER,
    CATALOG_ID_PATTERN,
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

test('boosters : Double Points et Double Coins à 10, Bounty à 5', () => {
    const consumables = SHOP_CATALOG.filter(item => item.kind === 'consumable');
    assert.deepEqual(
        consumables.map(item => [item.id, item.price]),
        [['consumable.double_points', 10], ['consumable.double_coins', 10], ['consumable.bounty', 5]],
    );
});

test('hasBoost reconnaît Bounty, boostMultiplier ne le confond pas avec un doublement', () => {
    assert.equal(hasBoost(['consumable.bounty'], 'capture_coins'), true);
    assert.equal(hasBoost(['consumable.double_coins'], 'capture_coins'), false);
    assert.equal(boostMultiplier(['consumable.bounty'], 'double_coins'), 1);
});

test('areOpponents : tout le monde en 1v3, l\'équipe d\'en face en 2v2', () => {
    assert.equal(areOpponents('red', 'blue', '1v3'), true);
    assert.equal(areOpponents('red', 'red', '1v3'), false);
    assert.equal(areOpponents('red', 'blue', '2v2'), false); // coéquipiers
    assert.equal(areOpponents('red', 'green', '2v2'), true);
    assert.equal(areOpponents('red', 'red', '2v2'), false);
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
