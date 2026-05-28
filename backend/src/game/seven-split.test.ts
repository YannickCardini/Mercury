// ─────────────────────────────────────────────────────────────────────────────
// Tests pour la cohérence du `canDiscard` côté carte 7.
//
// Bug d'origine : `findLegalMoveForCard('7')` ne considérait que le 7-entier
// (un seul pion avance de 7). Un 7 ne devient légal que si AU MOINS UNE
// option — soit le 7 entier, soit un split (1+6, 2+5, …) — est jouable.
// Sans la prise en compte des splits, `canDiscard` proposait la défausse
// même quand un split restait jouable, ou inversement empêchait la défausse
// quand le full-7 marchait alors que tous les splits étaient bloqués.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    findLegalMoveForCard,
    getLegalSplit7Action,
    getValidSevenStepsForMarble,
    type LegalMoveContext,
} from '@mercury/shared';
import type { Card, MarbleColor } from '@mercury/shared';

const SEVEN: Card = { id: 'test-7', value: '7', suit: '♠' };

function emptyByColor(): Record<MarbleColor, number[]> {
    return { red: [], green: [], blue: [], orange: [] };
}

function buildCtx(
    ownColor: MarbleColor,
    marblesByColor: Record<MarbleColor, number[]>,
    invincibleMarblesByColor: Record<MarbleColor, number[]> = emptyByColor(),
): LegalMoveContext {
    return {
        ownMarbles: [...marblesByColor[ownColor]],
        allMarbles: Object.values(marblesByColor).flat(),
        playerColor: ownColor,
        marblesByColor,
        invincibleMarblesByColor,
    };
}

test('findLegalMoveForCard(7) — 1 pion seul, full-7 bloqué par propre start sans promote possible → null (défausse autorisée)', () => {
    // Green start = 135. Pion à 86 (MAIN_PATH[7]). +7 atterrirait à 135 (own
    // start) mais stepsRequiredToPromote = 10, donc pas de promote → null.
    // Un seul pion donc aucun split possible non plus.
    const marbles = { ...emptyByColor(), green: [86] };
    const ctx = buildCtx('green', marbles);
    assert.equal(findLegalMoveForCard(SEVEN, ctx), null);
});

test('findLegalMoveForCard(7) — full-7 impossible pour tous les pions mais un split 1+6 (promote) est jouable → renvoie une Action split', () => {
    // Green pions à 86 / 90 / 105 :
    //   • 86 full-7 : stepsReq=10 ≠ 7, bloqué sur own start
    //   • 90 full-7 : stepsReq=6  ≠ 7, bloqué sur own start
    //   • 105 full-7: stepsReq=5  ≠ 7, bloqué sur own start
    // Mais split 1+6 (M1=86 avance 1 → 87, M2=90 promote 6 → 115) est valide.
    const marbles = { ...emptyByColor(), green: [86, 90, 105] };
    const ctx = buildCtx('green', marbles);
    const action = findLegalMoveForCard(SEVEN, ctx);
    assert.notEqual(action, null);
    assert.ok(action!.splitFrom !== undefined, 'doit être une Action split (splitFrom défini)');
    assert.ok(action!.splitTo !== undefined, 'doit être une Action split (splitTo défini)');
});

test('findLegalMoveForCard(7) — full-7 jouable sur un pion seul → renvoie une Action move (pas un split)', () => {
    // Green pion à 10 (MAIN_PATH[1]) ; +7 → 87 (idx 8), chemin libre. Move.
    const marbles = { ...emptyByColor(), green: [10] };
    const ctx = buildCtx('green', marbles);
    const action = findLegalMoveForCard(SEVEN, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.splitFrom, undefined, 'ne doit PAS être un split quand un full-7 existe');
    assert.equal(action!.from, 10);
    assert.equal(action!.to, 87);
});

test('findLegalMoveForCard(7) — full-7 impossible, mais split par promote vers une case d\'arrivée libre reste jouable → renvoie une Action split', () => {
    // Variante du bug du TODO point 2 avec un blue invincible bloquant la
    // direction inverse : le 7 doit être détecté comme jouable via un split
    // qui promote (M2=90 promote vers 116, la case d'arrivée encore libre
    // après [115] déjà occupée). Le comportement pré-fix ratait ce split.
    const marbles = {
        ...emptyByColor(),
        green: [86, 90, 105, 115],
        blue: [217],
    };
    const invincible = { ...emptyByColor(), blue: [217] };
    const ctx = buildCtx('green', marbles, invincible);
    const action = findLegalMoveForCard(SEVEN, ctx);
    assert.notEqual(action, null);
    assert.ok(action!.splitFrom !== undefined, 'doit être une Action split');
});

test('getLegalSplit7Action(7) — split 6+1 : pion en 88 promote→117 (115/116 occupées), pion en 105 avance→120', () => {
    // Scénario du screenshot. Zone d'arrivée verte [118,117,116,115] ;
    // 115 et 116 occupées ⇒ case libre la plus profonde = 117, à 6 pas du pion 88.
    const marbles = { ...emptyByColor(), green: [88, 105, 115, 116] };
    const ctx = buildCtx('green', marbles);

    // Le pas 6 doit être valide pour le pion 88 (cohérent avec dot 6 non grisé).
    assert.ok(getValidSevenStepsForMarble(88, ctx).includes(6), 'le pas 6 doit être valide pour le pion 88');

    const action = getLegalSplit7Action(SEVEN, 88, 6, 105, ctx);
    assert.notEqual(action, null, 'le split 6+1 doit être légal');
    assert.equal(action!.type, 'promote');
    assert.equal(action!.to, 117);
    assert.equal(action!.splitFrom, 105);
    assert.equal(action!.splitTo, 120);
    assert.equal(action!.splitType, 'move');
});
