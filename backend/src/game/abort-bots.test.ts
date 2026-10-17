// ─────────────────────────────────────────────────────────────────────────────
// Partie avec agents IA externes : leurs sièges sont `isHuman` (ils rejoignent
// comme des joueurs), mais une fois le dernier VRAI joueur parti, la partie est
// annulée au lieu de se poursuivre entre bots jusqu'au bout.
// TRAIN_MODE accélère les tours ; pas de DEBUG ici.
// ─────────────────────────────────────────────────────────────────────────────

process.env['TRAIN_MODE'] = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './game.js';
import { registerBotUserId } from '../session/bot-dispatch.js';
import type { GameMessenger, MessageHandler } from './game-messenger.js';
import type { ClientMessage, GameConfig, GameEndedMessage, GameStateMessage, MarbleColor, ServerMessage } from '@mercury/shared';

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

test('agents IA — l\'abandon du seul vrai joueur annule la partie', async () => {
    for (const id of ['bot-a', 'bot-b', 'bot-c']) registerBotUserId(id);
    const config: GameConfig = {
        players: [
            { name: 'Human', color: 'red', isHuman: true },
            { name: 'Agent A', color: 'blue', isHuman: true, userId: 'bot-a' },
            { name: 'Agent B', color: 'green', isHuman: true, userId: 'bot-b' },
            { name: 'Agent C', color: 'orange', isHuman: true, userId: 'bot-c' },
        ],
    };
    const { messenger, sent, dispatch } = fakeMessenger();
    new Game(config, messenger);
    await waitFor(() => sent.some(isNewTurn), 'premier New turn (tour humain rouge)');

    dispatch({ type: 'abandonGame' });
    await waitFor(() => sent.some(m => m.type === 'gameEnded'), 'gameEnded après abandon');
    const ended = sent.find((m): m is GameEndedMessage => m.type === 'gameEnded')!;
    assert.equal(ended.reason, 'abandoned');
});
