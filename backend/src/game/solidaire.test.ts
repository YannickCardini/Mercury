// ─────────────────────────────────────────────────────────────────────────────
// Tests de la « mise en jeu solidaire » (2v2) : quand la main du joueur actif
// est complètement bloquée mais qu'il possède un A, un K ou un Joker, que son
// coéquipier a des pions en réserve ET que la case de départ du coéquipier est
// TOTALEMENT libre, le joueur DOIT jouer cette carte pour faire entrer un pion
// du coéquipier au lieu de se défausser.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    findSolidaireEntry,
    getTeammateColor,
    HOME_POSITIONS,
    START_POSITIONS,
    ARRIVAL_POSITIONS,
    type LegalMoveContext,
} from '@mercury/shared';
import type { Card, CardValue, MarbleColor } from '@mercury/shared';

function card(value: CardValue): Card {
    return { id: `test-${value}`, value, suit: value === 'Joker' ? '🃏' : '♠' };
}

function emptyByColor(): Record<MarbleColor, number[]> {
    return { red: [], green: [], blue: [], orange: [] };
}

function buildTeamCtx(
    ownColor: MarbleColor,
    marblesByColor: Record<MarbleColor, number[]>,
    invincible: Record<MarbleColor, number[]> = emptyByColor(),
): LegalMoveContext {
    return {
        ownMarbles: [...marblesByColor[ownColor]],
        allMarbles: Object.values(marblesByColor).flat(),
        playerColor: ownColor,
        marblesByColor,
        invincibleMarblesByColor: invincible,
        teammateColor: getTeammateColor(ownColor),
    };
}

// Red a tous ses pions dans sa zone d'arrivée : plus aucun coup n'est possible,
// avec aucune carte (ni entrée — plus rien en réserve — ni déplacement).
const BLOCKED_RED = { ...emptyByColor(), red: [...ARRIVAL_POSITIONS.red] };

test('solidaire — main bloquée + K + réserve coéquipier + start libre → entrée forcée du pion blue', () => {
    const marbles = { ...BLOCKED_RED, blue: [HOME_POSITIONS.blue[0]!, HOME_POSITIONS.blue[1]!, 86] };
    const action = findSolidaireEntry([card('K')], buildTeamCtx('red', marbles));
    assert.notEqual(action, null);
    assert.equal(action!.type, 'enter');
    assert.equal(action!.to, START_POSITIONS.blue, 'entrée sur le start DU COÉQUIPIER');
    assert.ok(HOME_POSITIONS.blue.includes(action!.from), 'depuis une case de réserve blue');
    assert.equal(action!.marbleColor, 'blue');
    assert.equal(action!.playerColor, 'red');
    assert.equal(action!.cardPlayed![0]!.value, 'K');
});

test('solidaire — start du coéquipier occupé par N\'IMPORTE QUEL pion → pas d\'exception', () => {
    // « Totalement libre » : même un pion adverse sur le start bloque l'exception
    // (l'entrée normale, elle, aurait capturé).
    const marbles = {
        ...BLOCKED_RED,
        blue: [HOME_POSITIONS.blue[0]!, 86],
        orange: [START_POSITIONS.blue],
    };
    assert.equal(findSolidaireEntry([card('K')], buildTeamCtx('red', marbles)), null);
});

test('solidaire — un coup légal existe avec la main → pas d\'exception (main non bloquée)', () => {
    // Red a un pion mobile en 10 : la Q peut l'avancer de 12, la main n'est pas
    // bloquée. (Le K non plus ne serait pas bloqué : il peut l'avancer de 13.)
    const marbles = { ...emptyByColor(), red: [10], blue: [HOME_POSITIONS.blue[0]!] };
    assert.equal(findSolidaireEntry([card('K'), card('Q')], buildTeamCtx('red', marbles)), null);
});

test('solidaire — pas de carte d\'entrée (A/K/Joker) en main → pas d\'exception', () => {
    // Red fraîchement entré (invincible sur son start 9) : le 4 ne peut pas le
    // reculer → main [4] bloquée, mais aucune carte d'entrée.
    const marbles = { ...emptyByColor(), red: [START_POSITIONS.red], blue: [HOME_POSITIONS.blue[0]!] };
    const invincible = { ...emptyByColor(), red: [START_POSITIONS.red] };
    assert.equal(findSolidaireEntry([card('4')], buildTeamCtx('red', marbles, invincible)), null);
});

test('solidaire — coéquipier sans pion en réserve → pas d\'exception', () => {
    const marbles = { ...BLOCKED_RED, blue: [86, 87] };
    assert.equal(findSolidaireEntry([card('K')], buildTeamCtx('red', marbles)), null);
});

test('solidaire — mode 1v3 (pas de teammateColor) → jamais d\'exception', () => {
    const marbles = { ...BLOCKED_RED, blue: [HOME_POSITIONS.blue[0]!] };
    const ctx: LegalMoveContext = {
        ownMarbles: [...marbles.red],
        allMarbles: Object.values(marbles).flat(),
        playerColor: 'red',
        marblesByColor: marbles,
        invincibleMarblesByColor: emptyByColor(),
    };
    assert.equal(findSolidaireEntry([card('K')], ctx), null);
});

test('solidaire — priorité de la carte sacrifiée : A > K > Joker', () => {
    // On sacrifie la carte la plus faible en premier : l'As (+1) avant le Roi
    // (+13), et le Joker (+18 et rejeu) en tout dernier.
    const marbles = { ...BLOCKED_RED, blue: [HOME_POSITIONS.blue[0]!, 86] };
    const ctx = buildTeamCtx('red', marbles);
    assert.equal(findSolidaireEntry([card('Joker'), card('K'), card('A')], ctx)!.cardPlayed![0]!.value, 'A');
    assert.equal(findSolidaireEntry([card('Joker'), card('K')], ctx)!.cardPlayed![0]!.value, 'K');
    assert.equal(findSolidaireEntry([card('Joker')], ctx)!.cardPlayed![0]!.value, 'Joker');
});

test('solidaire — après le switch de fin de jeu, pas de double déclenchement', () => {
    // Red a fini : le ctx « switché » a playerColor=blue et teammateColor=red.
    // Red n'a plus de pion en réserve → l'exception ne se déclenche pas.
    const marbles = {
        ...emptyByColor(),
        red: [...ARRIVAL_POSITIONS.red],
        blue: [10],
    };
    const ctx: LegalMoveContext = {
        ownMarbles: [...marbles.blue],
        allMarbles: Object.values(marbles).flat(),
        playerColor: 'blue',
        marblesByColor: marbles,
        invincibleMarblesByColor: emptyByColor(),
        teammateColor: 'red',
    };
    assert.equal(findSolidaireEntry([card('K')], ctx), null);
});
