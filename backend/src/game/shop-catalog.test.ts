import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CATALOG_ID_PATTERN,
    FREE_REACTION_EMOJIS,
    REACTION_EMOJIS,
    SHOP_CATALOG,
    emojiItemId,
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
