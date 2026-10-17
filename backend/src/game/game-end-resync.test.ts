// ─────────────────────────────────────────────────────────────────────────────
// Reconnexion après la fin de partie : resendStateToPlayer renvoie aussi le
// gameEnded. Sans lui, un joueur dont la socket coupait au moment de la fin
// retrouvait le plateau final sans aucun écran de fin (l'overlay du client
// n'est piloté que par gameEnded).
// TRAIN_MODE accélère les tours IA ; pas de DEBUG ici.
// ─────────────────────────────────────────────────────────────────────────────

process.env['TRAIN_MODE'] = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './game.js';
import type { GameMessenger, MessageHandler } from './game-messenger.js';
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

test('reconnexion après la fin — le gameEnded est renvoyé avec l\'état', async () => {
    const { messenger, sent, dispatch } = fakeMessenger();
    const game = new Game(CONFIG, messenger);
    await waitFor(() => sent.some(isNewTurn), 'premier New turn (tour humain rouge)');

    // L'abandon du seul humain annule la partie (gameEnded « abandoned »).
    dispatch({ type: 'abandonGame' });
    await waitFor(() => sent.some(m => m.type === 'gameEnded'), 'gameEnded après abandon');

    const before = sent.length;
    game.resendStateToPlayer('red');
    const resent = sent.slice(before);
    assert.ok(resent.some(m => m.type === 'gameState'), 'état renvoyé');
    const ended = resent.find(m => m.type === 'gameEnded');
    assert.deepEqual(ended, { type: 'gameEnded', winners: [], reason: 'abandoned' });
});
