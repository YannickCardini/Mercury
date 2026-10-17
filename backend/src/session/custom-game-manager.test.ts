// ─────────────────────────────────────────────────────────────────────────────
// Custom rooms : la déconnexion d'un joueur qui a changé de siège.
//  - il entre bien en fenêtre de grâce et peut se reconnecter sur son siège
//    (avant : son handler visait sa couleur d'arrivée, rien ne se passait et
//    sa reconnexion était refusée « Already in this room from another tab ») ;
//  - le joueur qui occupe désormais son ancien siège n'est pas touché (avant :
//    il passait en grâce à sa place, ne recevait plus rien puis était éjecté).
// Chaque test détruit sa room (départ du créateur) pour ne laisser aucun timer.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomGameManager } from './custom-game-manager.js';
import { MatchmakingManager } from './matchmaking-manager.js';
import { PresenceManager } from './presence-manager.js';
import { ReconnectRegistry } from './reconnect-registry.js';
import type { ClientMessage, CustomRoomStatusMessage, ServerMessage } from '@mercury/shared';

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
        close: () => { /* rien à simuler */ },
    };
    const emit = (type: string, event: unknown) => {
        for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    };
    return {
        ws: ws as unknown as WebSocket,
        sent,
        /** Message client → serveur, tel qu'il arriverait sur la socket. */
        receive: (msg: ClientMessage) => emit('message', { data: JSON.stringify(msg) }),
        /** Fermeture côté client (app en arrière-plan, coupure réseau…). */
        drop: () => emit('close', { code: 1006, reason: '' }),
        statuses: () => sent.filter((m): m is CustomRoomStatusMessage => m.type === 'customRoomStatus'),
    };
}

function setup(creatorUserId?: string) {
    const presence = new PresenceManager();
    const manager = new CustomGameManager(new ReconnectRegistry(), new MatchmakingManager(), presence);
    const creator = fakeWs();
    manager.createRoom(creator.ws, {
        playerName: 'Creator',
        browserId: 'b-creator',
        ...(creatorUserId ? { userId: creatorUserId } : {}),
    });
    const code = creator.statuses().at(-1)!.code;
    return { manager, presence, creator, code };
}

test('custom room — après un changement de siège, la déconnexion ouvre la grâce et la reconnexion réussit', () => {
    const { manager, creator, code } = setup();
    const joiner = fakeWs();
    manager.joinRoom(joiner.ws, code, { playerName: 'Joiner', browserId: 'b-joiner' });
    assert.equal(joiner.statuses().at(-1)!.myColor, 'green');

    joiner.receive({ type: 'selectCustomSlot', color: 'blue' });
    assert.equal(joiner.statuses().at(-1)!.myColor, 'blue');

    joiner.drop();

    const back = fakeWs();
    manager.joinRoom(back.ws, code, { playerName: 'Joiner', browserId: 'b-joiner' });
    assert.equal(back.sent.filter(m => m.type === 'actionRejected').length, 0, 'la reconnexion ne doit pas être refusée');
    assert.equal(back.statuses().at(-1)?.myColor, 'blue', 'le joueur retrouve son siège');

    creator.receive({ type: 'leaveCustomRoom' });
});

test('custom room — la déconnexion ne touche pas le joueur assis sur l\'ancien siège', () => {
    const { manager, creator, code } = setup();
    const mover = fakeWs();
    manager.joinRoom(mover.ws, code, { playerName: 'Mover', browserId: 'b-mover' });
    mover.receive({ type: 'selectCustomSlot', color: 'blue' });

    const newcomer = fakeWs();
    manager.joinRoom(newcomer.ws, code, { playerName: 'Newcomer', browserId: 'b-newcomer' });
    assert.equal(newcomer.statuses().at(-1)!.myColor, 'green', 'le nouveau venu prend le siège libéré');

    mover.drop();

    // Un changement de siège du créateur rediffuse l'état à tous les joueurs
    // connectés : le nouveau venu doit le recevoir, le joueur parti non.
    const newcomerBefore = newcomer.statuses().length;
    const moverBefore = mover.statuses().length;
    creator.receive({ type: 'selectCustomSlot', color: 'orange' });
    assert.equal(newcomer.statuses().length, newcomerBefore + 1, 'le nouveau venu est toujours connecté');
    assert.equal(mover.statuses().length, moverBefore, 'le joueur déconnecté ne reçoit plus rien');

    creator.receive({ type: 'leaveCustomRoom' });
});

test('custom room — lancement refusé tant qu\'un joueur est en fenêtre de grâce', () => {
    const { manager, creator, code } = setup();
    const joiner = fakeWs();
    manager.joinRoom(joiner.ws, code, { playerName: 'Joiner', browserId: 'b-joiner' });
    joiner.drop();

    creator.receive({ type: 'startCustomRoom' });
    const rejection = creator.sent.at(-1);
    assert.deepEqual(rejection, { type: 'actionRejected', reason: 'A player is reconnecting, please wait' });

    // La room existe toujours : le joueur peut revenir sur son siège.
    const back = fakeWs();
    manager.joinRoom(back.ws, code, { playerName: 'Joiner', browserId: 'b-joiner' });
    assert.equal(back.statuses().at(-1)?.myColor, 'green');

    creator.receive({ type: 'leaveCustomRoom' });
});

test('invitation — un refus n\'est plus relivré au retour de l\'invité', () => {
    const { manager, presence, creator, code } = setup('u-creator');
    const invitee = fakeWs();
    presence.register('u-invitee', invitee.ws);

    creator.receive({ type: 'inviteUser', toUserId: 'u-invitee', roomCode: code });
    assert.equal(invitee.sent.filter(m => m.type === 'gameInvite').length, 1, 'invitation livrée');

    manager.handleInviteResponse('u-invitee', 'u-creator', false);
    assert.deepEqual(
        creator.sent.filter(m => m.type === 'gameInviteResponse'),
        [{ type: 'gameInviteResponse', fromUserId: 'u-invitee', accepted: false }],
        'le refus est relayé au créateur',
    );

    // L'invité revient sur l'accueil (nouvelle socket de présence).
    presence.unregister(invitee.ws);
    const inviteeAgain = fakeWs();
    presence.register('u-invitee', inviteeAgain.ws);
    assert.equal(inviteeAgain.sent.filter(m => m.type === 'gameInvite').length, 0, 'invitation refusée non relivrée');

    // Une réponse sans invitation en attente n'est relayée à personne.
    const relayed = creator.sent.length;
    manager.handleInviteResponse('u-stranger', 'u-creator', true);
    assert.equal(creator.sent.length, relayed);

    creator.receive({ type: 'leaveCustomRoom' });
});
