// ─────────────────────────────────────────────────────────────────────────────
// Régression : un pion invincible sur le chemin doit bloquer une promotion,
// y compris quand le coup joué (ex: Joker, +18) traverse la case de départ.
//
// Bug d'origine : `buildMoveAction` détectait qu'un coup franchissait la case
// de départ du joueur et, dans ce cas, calculait directement la case
// d'arrivée via `getArrivelCaseIfCanPromote` SANS jamais appeler
// `pathIsClear` — donc sans jamais vérifier les pions invincibles sur le
// trajet. Un Joker (distance fixe de 18) déclenche très souvent ce chemin de
// code, d'où le bug observé en prod : un pion à 18 cases de la promotion
// passait au travers d'un pion invincible adverse.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { getLegalAction, type LegalMoveContext } from '@mercury/shared';
import type { Card, MarbleColor } from '@mercury/shared';

const JOKER: Card = { id: 'test-joker', value: 'Joker', suit: '🃏' };

function emptyByColor(): Record<MarbleColor, number[]> {
    return { red: [], green: [], blue: [], orange: [] };
}

test('Joker (+18) — un pion invincible sur le trajet bloque la promotion', () => {
    // Green start = 135 (MAIN_PATH[14]). Pion green en 8 (MAIN_PATH[55]) :
    // 15 pas de chemin principal jusqu'à 135, + 3 (4 cases d'arrivée libres -
    // 1) = 18 pas requis pour promouvoir, exactement la distance du Joker.
    // Red vient d'entrer et est invincible sur SON start (9, MAIN_PATH[0]),
    // qui se trouve sur le trajet (8 → 9 → 10 → 25 → ... → 135).
    const marblesByColor = { ...emptyByColor(), green: [8], red: [9] };
    const invincibleMarblesByColor = { ...emptyByColor(), red: [9] };
    const ctx: LegalMoveContext = {
        ownMarbles: [8],
        allMarbles: [8, 9],
        playerColor: 'green',
        marblesByColor,
        invincibleMarblesByColor,
    };

    assert.equal(getLegalAction(JOKER, 8, ctx), null, 'le pion invincible doit bloquer la promotion');
});

test('Joker (+18) — un pion invincible de SA couleur sur SON start ne bloque PAS la promotion', () => {
    // Même géométrie que ci-dessus, mais le pion « bloquant » est un pion
    // GREEN fraîchement entré (invincible) sur le start green (135). Le pion
    // promu bifurque dans le couloir d'arrivée sans occuper le start : la
    // promotion doit rester légale (bug observé en 2v2 avec le 7 partagé).
    const marblesByColor = { ...emptyByColor(), green: [8, 135] };
    const invincibleMarblesByColor = { ...emptyByColor(), green: [135] };
    const ctx: LegalMoveContext = {
        ownMarbles: [8, 135],
        allMarbles: [8, 135],
        playerColor: 'green',
        marblesByColor,
        invincibleMarblesByColor,
    };

    const action = getLegalAction(JOKER, 8, ctx);
    assert.notEqual(action, null, 'le pion invincible sur son propre start ne doit pas bloquer la promotion');
    assert.equal(action!.type, 'promote');
    assert.equal(action!.to, 115);
});

test('Joker (+18) — sans pion invincible sur le trajet, la promotion reste légale', () => {
    // Même géométrie que ci-dessus, mais sans pion bloquant : la promotion
    // doit rester autorisée (non-régression du comportement normal).
    const marblesByColor = { ...emptyByColor(), green: [8] };
    const ctx: LegalMoveContext = {
        ownMarbles: [8],
        allMarbles: [8],
        playerColor: 'green',
        marblesByColor,
        invincibleMarblesByColor: emptyByColor(),
    };

    const action = getLegalAction(JOKER, 8, ctx);
    assert.notEqual(action, null);
    assert.equal(action!.type, 'promote');
    assert.equal(action!.to, 115);
});
