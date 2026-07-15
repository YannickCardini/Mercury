// ─────────────────────────────────────────────────────────────────────────────
// Édition du plateau en mode debug (debugPause / debugResume) :
//  - la pause fige la partie : turnTimeout et playAction sont ignorés ;
//  - la reprise applique les positions éditées comme état autoritaire
//    (invincibilités remises à zéro) et rebroadcaste un « New turn » ;
//  - un état invalide (doublon de case, case hors plateau) est rejeté et la
//    partie reste en pause.
// DEBUG/TRAIN_MODE sont lus à l'appel (voir isDebugEnabled/isTrainMode) : les
// poser ici suffit, même si ce module est évalué avant.
// ─────────────────────────────────────────────────────────────────────────────

process.env['DEBUG'] = 'true';
process.env['TRAIN_MODE'] = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './game.js';
import type { GameMessenger, MessageHandler } from './game-messenger.js';
import { HOME_POSITIONS, START_POSITIONS } from '@mercury/shared';
import type { ClientMessage, GameConfig, GameStateMessage, MarbleColor, ServerMessage } from '@mercury/shared';

function fakeMessenger() {
    const sent: ServerMessage[] = [];
    let handler: MessageHandler | null = null;
    const messenger: GameMessenger = {
        send: msg => { sent.push(msg); },
        sendTo: (_color, msg) => { sent.push(msg); },
        onMessage: h => { handler = h; },
    };
    const dispatch = (msg: ClientMessage, color: MarbleColor | null = 'red') => handler?.(msg, color);
    return { messenger, sent, dispatch };
}

const CONFIG: GameConfig = {
    gameMode: '2v2',
    players: [
        { name: 'Human', color: 'red', isHuman: true },
        { name: 'Bot1', color: 'blue', isHuman: false },
        { name: 'Bot2', color: 'green', isHuman: false },
        { name: 'Bot3', color: 'orange', isHuman: false },
    ],
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) throw new Error(`Timeout en attendant : ${label}`);
        await wait(10);
    }
}

const isNewTurn = (m: ServerMessage): m is GameStateMessage =>
    m.type === 'gameState' && (m as GameStateMessage).message === 'New turn';

/** Positions de départ (toutes en réserve) avec le 1er pion rouge posé sur son start. */
function editedPositions(): Record<MarbleColor, number[]> {
    const red = [...HOME_POSITIONS.red];
    red[0] = START_POSITIONS.red;
    return {
        red,
        blue: [...HOME_POSITIONS.blue],
        green: [...HOME_POSITIONS.green],
        orange: [...HOME_POSITIONS.orange],
    };
}

/** Termine proprement la partie (abandon du seul humain → abort) pour ne pas fuiter de timers. */
async function endGame(sent: ServerMessage[], dispatch: (msg: ClientMessage, color?: MarbleColor | null) => void): Promise<void> {
    dispatch({ type: 'abandonGame' });
    await waitFor(() => sent.some(m => m.type === 'gameEnded'), 'gameEnded après abandon');
}

test('debugPause — turnTimeout et playAction ignorés pendant la pause', async () => {
    const { messenger, sent, dispatch } = fakeMessenger();
    new Game(CONFIG, messenger);
    await waitFor(() => sent.some(isNewTurn), 'premier New turn (tour humain rouge)');

    dispatch({ type: 'debugPause' });
    const before = sent.length;

    // Timeout du timer client pendant l'édition : aucun coup ne doit être imposé.
    dispatch({ type: 'turnTimeout' });
    // Action de jeu pendant la pause : ignorée elle aussi.
    dispatch({
        type: 'playAction',
        action: { type: 'pass', from: 0, to: 0, cardPlayed: null, playerColor: 'red' },
    });
    await wait(100);
    assert.equal(
        sent.slice(before).filter(m => m.type === 'actionPlayed').length, 0,
        'aucune action ne doit être jouée pendant la pause debug',
    );

    dispatch({ type: 'debugResume', marblePositions: editedPositions() });
    await endGame(sent, dispatch);
});

test('debugResume — applique l\'état édité et rebroadcaste un New turn', async () => {
    const { messenger, sent, dispatch } = fakeMessenger();
    new Game(CONFIG, messenger);
    await waitFor(() => sent.some(isNewTurn), 'premier New turn (tour humain rouge)');

    dispatch({ type: 'debugPause' });
    const before = sent.length;
    dispatch({ type: 'debugResume', marblePositions: editedPositions() });

    await waitFor(() => sent.slice(before).some(isNewTurn), 'New turn de reprise');
    const resumed = sent.slice(before).filter(isNewTurn).at(-1)!;
    const red = resumed.gameState.players.find(p => p.color === 'red')!;
    assert.deepEqual([...red.marblePositions].sort((a, b) => a - b),
        [START_POSITIONS.red, ...HOME_POSITIONS.red.slice(1)].sort((a, b) => a - b),
        'le pion rouge édité doit être sur sa case de start');
    assert.deepEqual(red.marbleInvincible, [false, false, false, false],
        'les invincibilités sont remises à zéro à la reprise');

    await endGame(sent, dispatch);
});

test('debugResume — état invalide rejeté, la partie reste en pause', async () => {
    const { messenger, sent, dispatch } = fakeMessenger();
    new Game(CONFIG, messenger);
    await waitFor(() => sent.some(isNewTurn), 'premier New turn (tour humain rouge)');

    dispatch({ type: 'debugPause' });

    // Doublon : le pion rouge posé sur une case déjà occupée par un pion bleu.
    const duplicated = editedPositions();
    duplicated.red[0] = duplicated.blue[0]!;
    const before = sent.length;
    dispatch({ type: 'debugResume', marblePositions: duplicated });
    await waitFor(() => sent.slice(before).some(m => m.type === 'actionRejected'), 'actionRejected (doublon)');
    assert.equal(sent.slice(before).filter(isNewTurn).length, 0, 'pas de reprise sur état invalide');

    // Toujours en pause : un turnTimeout reste ignoré.
    dispatch({ type: 'turnTimeout' });
    await wait(100);
    assert.equal(sent.slice(before).filter(m => m.type === 'actionPlayed').length, 0,
        'la partie doit rester en pause après un rejet');

    // Un état corrigé est accepté et relance la partie.
    dispatch({ type: 'debugResume', marblePositions: editedPositions() });
    await waitFor(() => sent.slice(before).some(isNewTurn), 'New turn après correction');

    await endGame(sent, dispatch);
});
