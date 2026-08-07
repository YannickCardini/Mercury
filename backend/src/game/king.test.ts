// ─────────────────────────────────────────────────────────────────────────────
// Carte Roi (K) : elle fait ENTRER un pion depuis la réserve, OU avance un pion
// déjà en jeu de 13 cases (comme l'As +1 et le Joker +18). Le joueur choisit
// l'option en sélectionnant le pion : en réserve ⇒ entrée, sur le chemin ⇒ +13.
//
// Repères de géométrie (red) : start = 9 = MAIN_PATH[0], réserve = [56,57,71,72],
// arrivée = [38,53,68,83]. Le déplacement de 13 hérite de `buildMoveAction` :
// capture, promotion exacte, blocage par un invincible et par sa propre case de
// départ — ces tests verrouillent cet héritage.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getLegalAction,
    findLegalMoveForCard,
    HOME_POSITIONS,
    START_POSITIONS,
    ARRIVAL_POSITIONS,
    type LegalMoveContext,
} from '@mercury/shared';
import type { Card, CardValue, MarbleColor } from '@mercury/shared';

function card(value: CardValue): Card {
    return { id: `test-${value}`, value, suit: value === 'Joker' ? '🃏' : '♠' };
}

const KING = card('K');

function emptyByColor(): Record<MarbleColor, number[]> {
    return { red: [], green: [], blue: [], orange: [] };
}

function buildCtx(
    marblesByColor: Record<MarbleColor, number[]>,
    invincible: Record<MarbleColor, number[]> = emptyByColor(),
): LegalMoveContext {
    return {
        ownMarbles: [...marblesByColor.red],
        allMarbles: Object.values(marblesByColor).flat(),
        playerColor: 'red',
        marblesByColor,
        invincibleMarblesByColor: invincible,
    };
}

// ── Entrée en jeu (non-régression) ───────────────────────────────────────────

test('K — un pion en réserve entre sur la case de départ', () => {
    const ctx = buildCtx({ ...emptyByColor(), red: [HOME_POSITIONS.red[0]!] });
    const action = getLegalAction(KING, HOME_POSITIONS.red[0]!, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'enter');
    assert.equal(action!.to, START_POSITIONS.red);
});

test('K — entrée refusée si un pion PROPRE occupe déjà la case de départ', () => {
    const ctx = buildCtx({ ...emptyByColor(), red: [HOME_POSITIONS.red[0]!, START_POSITIONS.red] });
    assert.equal(getLegalAction(KING, HOME_POSITIONS.red[0]!, ctx), null);
});

test('K — entrée autorisée si un pion ADVERSE occupe la case de départ (il sera capturé)', () => {
    const ctx = buildCtx({
        ...emptyByColor(),
        red: [HOME_POSITIONS.red[0]!],
        green: [START_POSITIONS.red],
    });
    const action = getLegalAction(KING, HOME_POSITIONS.red[0]!, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'enter');
});

// ── Déplacement de 13 (nouveau) ──────────────────────────────────────────────

test('K — un pion sur le chemin avance de 13 cases', () => {
    // 10 = MAIN_PATH[1] → +13 = MAIN_PATH[14] = 135.
    const ctx = buildCtx({ ...emptyByColor(), red: [10] });
    const action = getLegalAction(KING, 10, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'move');
    assert.equal(action!.to, 135);
});

test('K — le +13 capture un pion adverse sur la case d\'arrivée', () => {
    const ctx = buildCtx({ ...emptyByColor(), red: [10], green: [135] });
    const action = getLegalAction(KING, 10, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'capture');
    assert.equal(action!.to, 135);
});

test('K — le +13 est refusé si un pion PROPRE occupe la case d\'arrivée', () => {
    const ctx = buildCtx({ ...emptyByColor(), red: [10, 135] });
    assert.equal(getLegalAction(KING, 10, ctx), null);
});

test('K — un pion invincible sur le trajet bloque le +13', () => {
    // 220 = MAIN_PATH[25] → +13 = MAIN_PATH[38] = 137. Le trajet passe par
    // 217 (MAIN_PATH[28]), le start de blue, où un pion blue vient d'entrer.
    const marbles = { ...emptyByColor(), red: [220], blue: [217] };
    const invincible = { ...emptyByColor(), blue: [217] };
    assert.equal(getLegalAction(KING, 220, buildCtx(marbles, invincible)), null);
});

test('K — un pion NON invincible sur le trajet ne bloque pas le +13', () => {
    // Même géométrie, mais le pion blue en 217 a déjà bougé : on le traverse.
    const marbles = { ...emptyByColor(), red: [220], blue: [217] };
    const action = getLegalAction(KING, 220, buildCtx(marbles));
    assert.notEqual(action, null);
    assert.equal(action!.type, 'move');
    assert.equal(action!.to, 137);
});

// ── Promotion dans la zone d'arrivée ─────────────────────────────────────────

test('K — le +13 promeut quand le compte tombe juste', () => {
    // 79 = MAIN_PATH[46] : 10 pas jusqu'au start red (MAIN_PATH[0]), + 3
    // (4 cases d'arrivée libres − 1) = 13 pas requis, exactement la distance du K.
    const ctx = buildCtx({ ...emptyByColor(), red: [79] });
    const action = getLegalAction(KING, 79, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'promote');
    assert.equal(action!.to, ARRIVAL_POSITIONS.red[3]);
});

test('K — le +13 est injouable s\'il dépasse la zone d\'arrivée', () => {
    // 80 = MAIN_PATH[47] : 9 pas jusqu'au start, + 3 = 12 pas requis pour
    // promouvoir. Avec 13, le pion dépasserait — et il ne peut pas non plus
    // traverser sa propre case de départ.
    const ctx = buildCtx({ ...emptyByColor(), red: [80] });
    assert.equal(getLegalAction(KING, 80, ctx), null);
});

// ── Choix entrée / déplacement pour l'IA et le fallback de timeout ───────────

test('K — findLegalMoveForCard privilégie l\'entrée sur le +13', () => {
    // Le pion sur le chemin est listé EN PREMIER : sans le tri « réserve
    // d'abord », c'est le +13 qui serait retourné.
    const ctx = buildCtx({ ...emptyByColor(), red: [10, HOME_POSITIONS.red[0]!] });
    const action = findLegalMoveForCard(KING, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'enter');
    assert.equal(action!.to, START_POSITIONS.red);

    // Même garantie pour les deux autres cartes bivalentes.
    assert.equal(findLegalMoveForCard(card('A'), ctx)!.type, 'enter');
    assert.equal(findLegalMoveForCard(card('Joker'), ctx)!.type, 'enter');
});

test('K — sans pion en réserve, findLegalMoveForCard retourne bien le +13', () => {
    const ctx = buildCtx({ ...emptyByColor(), red: [10] });
    const action = findLegalMoveForCard(KING, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'move');
    assert.equal(action!.to, 135);
});
