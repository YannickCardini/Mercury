// ─────────────────────────────────────────────────────────────────────────────
// Régression : une socket fermée mais encore présente dans `connections` (la
// fenêtre entre l'event 'close' et l'expiration du timer de reconnexion) ne
// doit jamais faire planter un envoi vers les AUTRES joueurs. Avant le
// garde-fou `safeSend`, un `ws.send()` qui lève une exception synchrone
// pouvait faire échouer tout un `Promise.all` de `sendTo` (ex: distribution
// des gains de fin de partie) — voir applyEndGamePoints dans game.ts.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiWsMessenger } from './game-messenger.js';
import type { ServerMessage } from '@mercury/shared';

/** Fausse WebSocket minimale compatible avec MultiWsMessenger (addEventListener + send). */
function fakeWs(opts: { throwOnSend?: boolean } = {}): { ws: WebSocket; received: string[] } {
    const received: string[] = [];
    const ws = {
        addEventListener: () => { /* no-op : on ne teste pas les handlers close/message ici */ },
        send: (data: string) => {
            if (opts.throwOnSend) throw new Error('WebSocket is not open: readyState 3 (CLOSED)');
            received.push(data);
        },
    } as unknown as WebSocket;
    return { ws, received };
}

const PING: ServerMessage = { type: 'gameEnded', winners: [], reason: 'win' };

test('sendTo — une socket dont send() lève ne fait pas planter l\'appelant', () => {
    const messenger = new MultiWsMessenger();
    const { ws } = fakeWs({ throwOnSend: true });
    messenger.addConnection('red', ws);

    assert.doesNotThrow(() => messenger.sendTo('red', PING));
});

test('sendTo — couleur non connectée : no-op silencieux', () => {
    const messenger = new MultiWsMessenger();
    assert.doesNotThrow(() => messenger.sendTo('red', PING));
});

test('send (broadcast) — une socket qui lève n\'empêche pas la livraison aux autres', () => {
    const messenger = new MultiWsMessenger();
    const broken = fakeWs({ throwOnSend: true });
    const healthy = fakeWs();
    messenger.addConnection('red', broken.ws);
    messenger.addConnection('blue', healthy.ws);

    assert.doesNotThrow(() => messenger.send(PING));
    assert.equal(healthy.received.length, 1, 'blue doit recevoir le message malgré l\'échec de red');
    assert.deepEqual(JSON.parse(healthy.received[0]!), PING);
});

test('sendTo — livre uniquement au destinataire attendu', () => {
    const messenger = new MultiWsMessenger();
    const red = fakeWs();
    const blue = fakeWs();
    messenger.addConnection('red', red.ws);
    messenger.addConnection('blue', blue.ws);

    messenger.sendTo('blue', PING);

    assert.equal(red.received.length, 0);
    assert.equal(blue.received.length, 1);
    assert.deepEqual(JSON.parse(blue.received[0]!), PING);
});
