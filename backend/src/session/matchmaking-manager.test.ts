// ─────────────────────────────────────────────────────────────────────────────
// File publique : un même compte (deux appareils, deux profils de navigateur)
// ne peut pas y occuper deux sièges — il marquerait deux fois les points de la
// même partie (+4 et −1 sur deux équipes opposées).
// TRAIN_MODE coupe le dispatch d'agents IA (et son timer) et les alertes.
// ─────────────────────────────────────────────────────────────────────────────

process.env['TRAIN_MODE'] = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchmakingManager } from './matchmaking-manager.js';
import type { ServerMessage } from '@mercury/shared';

type Listener = (event: unknown) => void;

/** Fausse WebSocket : listeners par type, envois capturés, fermeture simulable. */
function fakeWs() {
    const listeners = new Map<string, Set<Listener>>();
    const sent: ServerMessage[] = [];
    const ws = {
        addEventListener: (type: string, fn: Listener) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(fn);
        },
        removeEventListener: (type: string, fn: Listener) => { listeners.get(type)?.delete(fn); },
        send: (data: string) => { sent.push(JSON.parse(data) as ServerMessage); },
    };
    const drop = () => { for (const fn of [...(listeners.get('close') ?? [])]) fn({ code: 1006, reason: '' }); };
    return { ws: ws as unknown as WebSocket, sent, drop };
}

test('matchmaking — un compte déjà en file est refusé depuis un autre appareil', () => {
    const matchmaking = new MatchmakingManager();
    const phone = fakeWs();
    const laptop = fakeWs();

    matchmaking.joinQueue(phone.ws, 'Alice', undefined, 'browser-phone', undefined, 'u-alice');
    matchmaking.joinQueue(laptop.ws, 'Alice', undefined, 'browser-laptop', undefined, 'u-alice');

    assert.equal(matchmaking.getQueueSummary().waiting, 1, 'un seul siège pour le compte');
    assert.deepEqual(laptop.sent.at(-1), { type: 'actionRejected', reason: 'Already in matchmaking from another tab' });

    phone.drop();
    assert.equal(matchmaking.getQueueSummary().waiting, 0);
});
