// ─────────────────────────────────────────────────────────────────────────────
// Validation serveur des coups humains : la carte jouée est relue dans la main
// serveur, seul son id vient du client.
//  - une valeur falsifiée (un 5 déclaré Joker) ne fait pas entrer de pion ;
//  - quand le coup reste légal avec la vraie carte, c'est elle qui est jouée
//    (carte et distance diffusées), pas la valeur déclarée.
// DEBUG fige la main distribuée (deck.ts : K♠, J♥, 5♠, 7♥, 7♦) et ouvre
// debugPause/debugResume pour poser le plateau ; TRAIN_MODE accélère les IA.
// ─────────────────────────────────────────────────────────────────────────────

process.env['DEBUG'] = 'true';
process.env['TRAIN_MODE'] = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './game.js';
import type { GameMessenger, MessageHandler } from './game-messenger.js';
import { HOME_POSITIONS, START_POSITIONS, getPositionAfterMove } from '@mercury/shared';
import type { ActionPlayedMessage, Card, ClientMessage, GameConfig, GameStateMessage, MarbleColor, ServerMessage } from '@mercury/shared';

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

/** Termine proprement la partie (abandon du seul humain → abort) pour ne pas fuiter de timers. */
async function endGame(sent: ServerMessage[], dispatch: (msg: ClientMessage, color?: MarbleColor | null) => void): Promise<void> {
    dispatch({ type: 'abandonGame' });
    await waitFor(() => sent.some(m => m.type === 'gameEnded'), 'gameEnded après abandon');
}

/** Le 5♠ de la main DEBUG (id '44'), redéclaré sous une autre valeur. */
const forged = (value: Card['value']): Card => ({ id: '44', suit: '♠', value });

test('carte falsifiée — un 5 déclaré Joker ne fait pas entrer de pion', async () => {
    const { messenger, sent, dispatch } = fakeMessenger();
    new Game(CONFIG, messenger);
    await waitFor(() => sent.some(isNewTurn), 'premier New turn (tour humain rouge)');

    // Tous les pions en réserve : le start rouge est libre, une vraie entrée
    // (A, K ou Joker) y serait légale — et rejouerait avec un Joker.
    dispatch({ type: 'debugPause' });
    const resumeFrom = sent.length;
    dispatch({
        type: 'debugResume',
        marblePositions: {
            red: [...HOME_POSITIONS.red],
            blue: [...HOME_POSITIONS.blue],
            green: [...HOME_POSITIONS.green],
            orange: [...HOME_POSITIONS.orange],
        },
    });
    await waitFor(() => sent.slice(resumeFrom).some(isNewTurn), 'New turn après édition du plateau');

    const before = sent.length;
    dispatch({
        type: 'playAction',
        action: {
            type: 'enter',
            from: HOME_POSITIONS.red[0]!,
            to: START_POSITIONS.red,
            cardPlayed: [forged('Joker')],
            playerColor: 'red',
        },
    });
    await waitFor(() => sent.slice(before).some(m => m.type === 'actionRejected'), 'actionRejected (carte falsifiée)');
    assert.equal(
        sent.slice(before).filter(m => m.type === 'actionPlayed').length, 0,
        'le 5 ne doit pas pouvoir entrer un pion sous couvert de Joker',
    );

    await endGame(sent, dispatch);
});

test('pass humain — refusé tant que la main n\'est pas vide', async () => {
    const { messenger, sent, dispatch } = fakeMessenger();
    new Game(CONFIG, messenger);
    await waitFor(() => sent.some(isNewTurn), 'premier New turn (tour humain rouge)');

    const before = sent.length;
    dispatch({
        type: 'playAction',
        action: { type: 'pass', from: 0, to: 0, cardPlayed: null, playerColor: 'red' },
    });
    await waitFor(() => sent.slice(before).some(m => m.type === 'actionRejected'), 'actionRejected (pass)');
    assert.equal(sent.slice(before).filter(m => m.type === 'actionPlayed').length, 0, 'le tour ne doit pas être sauté');

    await endGame(sent, dispatch);
});

test('carte falsifiée — la vraie carte est jouée quand le coup reste légal', async () => {
    const { messenger, sent, dispatch } = fakeMessenger();
    new Game(CONFIG, messenger);
    await waitFor(() => sent.some(isNewTurn), 'premier New turn (tour humain rouge)');

    // Le pion rouge posé sur son start au lancement (player.ts) avance de 5
    // avec le vrai 5♠ — et de 13 si le serveur croyait le Roi déclaré.
    const before = sent.length;
    dispatch({
        type: 'playAction',
        action: {
            type: 'move',
            from: START_POSITIONS.red,
            to: 0,
            cardPlayed: [forged('K')],
            playerColor: 'red',
        },
    });
    await waitFor(() => sent.slice(before).some(m => m.type === 'actionPlayed'), 'actionPlayed du coup rouge');
    const played = sent.slice(before).find((m): m is ActionPlayedMessage => m.type === 'actionPlayed')!;
    assert.deepEqual(played.action.cardPlayed, [{ id: '44', suit: '♠', value: '5' }]);
    assert.equal(played.action.to, getPositionAfterMove(START_POSITIONS.red, 5));

    await endGame(sent, dispatch);
});
