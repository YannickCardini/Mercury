// ─────────────────────────────────────────────────────────────────────────────
// Persistance des parties (survie aux redéploiements) :
//  - Deck.getCards/setCards préserve l'ordre de la pioche ;
//  - toSnapshotData → fromSnapshot → toSnapshotData est un aller-retour fidèle
//    (mains, pioche, défausse, index de tour, pénalités) ;
//  - une partie restaurée 100% IA reprend sa boucle (redistribution comprise)
//    et se termine naturellement ;
//  - validateSnapshot rejette les snapshots d'une autre version de schéma,
//    trop anciens, malformés ou déjà gagnés.
// TRAIN_MODE accélère les tours IA ; PAS de DEBUG ici (drawCards trichées).
// ─────────────────────────────────────────────────────────────────────────────

process.env['TRAIN_MODE'] = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './game.js';
import { Deck } from './deck.js';
import { SNAPSHOT_SCHEMA_VERSION, type GameSnapshot } from './game-snapshot.js';
import { validateSnapshot } from '../session/game-restore.js';
import { ARRIVAL_POSITIONS, HOME_POSITIONS } from '@mercury/shared';
import type { GameMessenger, MessageHandler } from './game-messenger.js';
import type { Card, ClientMessage, GameConfig, MarbleColor, ServerMessage } from '@mercury/shared';

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
        { name: 'Human', color: 'red', isHuman: true, userId: 'u-red' },
        { name: 'Bot1', color: 'blue', isHuman: false },
        { name: 'Bot2', color: 'green', isHuman: false },
        { name: 'Bot3', color: 'orange', isHuman: false },
    ],
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) throw new Error(`Timeout en attendant : ${label}`);
        await wait(10);
    }
}

/** Termine proprement la partie (abandon du seul humain → abort) pour ne pas fuiter de timers. */
async function endGame(sent: ServerMessage[], dispatch: (msg: ClientMessage, color?: MarbleColor | null) => void): Promise<void> {
    dispatch({ type: 'abandonGame' });
    await waitFor(() => sent.some(m => m.type === 'gameEnded'), 'gameEnded après abandon');
}

/** Snapshot valide de référence, modifiable par les tests de validation. */
function baseSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
    const card = (id: string): Card => ({ id, suit: '♥', value: 'A' });
    const players = (['red', 'blue', 'green', 'orange'] as MarbleColor[]).map(color => ({
        name: `P-${color}`,
        color,
        isHuman: false,
        marblePositions: [...HOME_POSITIONS[color]],
        marbleInvincible: [false, false, false, false],
        cards: [card(`h-${color}`)],
    }));
    return {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        savedAt: Date.now(),
        gameId: 'test-game',
        gameMode: '1v3',
        turn: 7,
        round: 2,
        firstPlayerOfRound: 1,
        currentPlayerIndex: 2,
        startTime: Date.now() - 60_000,
        deckCards: [card('d1'), card('d2'), card('d3'), card('d4')],
        discardedCards: [card('x1')],
        penalizedUserIds: [],
        players,
        reconnectSlots: [],
        ...overrides,
    };
}

test('Deck — getCards/setCards restaure la pioche dans le même ordre', () => {
    const deck = new Deck();
    deck.shuffle();
    const order = deck.getCards();

    const restored = new Deck();
    restored.setCards(order);

    assert.deepEqual(restored.getCards(), order);
    assert.equal(restored.remainingCards(), 54);
});

test('Game — aller-retour toSnapshotData → fromSnapshot fidèle', async () => {
    const { messenger, sent, dispatch } = fakeMessenger();
    const game = new Game(CONFIG, messenger);
    // Tour humain rouge en cours : l'état est stable tant qu'on ne joue pas.
    await waitFor(() => sent.some(m => m.type === 'gameState'), 'premier gameState');

    const snapData = game.toSnapshotData();
    const snapshot: GameSnapshot = { ...snapData, reconnectSlots: [] };

    // Sanity : la partie vient de distribuer la manche 1.
    assert.equal(snapshot.round, 1);
    assert.equal(snapshot.players.length, 4);
    assert.ok(snapshot.players.every(p => p.cards.length === 5), 'mains de 5 cartes en manche 1');
    assert.equal(snapshot.deckCards.length, 54 - 4 * 5);
    assert.equal(snapshot.players[0]!.userId, 'u-red');

    const restoredEnv = fakeMessenger();
    const restored = Game.fromSnapshot(snapshot, restoredEnv.messenger);

    assert.equal(restored.id, snapshot.gameId);
    const roundTrip = restored.toSnapshotData();
    // savedAt est le seul champ dépendant du moment de l'appel.
    const { savedAt: _a, ...expected } = snapshot as GameSnapshot & { savedAt: number };
    delete (expected as Partial<GameSnapshot>).reconnectSlots;
    const { savedAt: _b, ...actual } = roundTrip;
    assert.deepEqual(actual, expected);

    // La partie restaurée attend les reconnexions : le siège humain repart
    // déconnecté, un joinGame (resendStateToPlayer) le remet en ligne.
    restored.resendStateToPlayer('red');
    assert.ok(restoredEnv.sent.some(m => m.type === 'gameState'), 'état renvoyé au joueur reconnecté');

    await endGame(sent, dispatch);
    await endGame(restoredEnv.sent, restoredEnv.dispatch);
});

test('Game — une partie restaurée 100% IA reprend sa boucle et se termine', async () => {
    // Mains vides → la reprise doit passer par startNewRound/dealCards sans
    // crasher, puis dérouler la partie jusqu'à une victoire naturelle.
    const snapshot = baseSnapshot({
        gameId: 'test-restore-ai',
        players: baseSnapshot().players.map(p => ({ ...p, cards: [] })),
    });

    const { messenger, sent } = fakeMessenger();
    Game.fromSnapshot(snapshot, messenger);

    // Aucun siège humain : pas d'attente de reconnexion, reprise immédiate.
    await waitFor(() => sent.some(m => m.type === 'gameState'), 'reprise de la boucle (redistribution)');
    await waitFor(
        () => sent.some(m => m.type === 'gameEnded' && m.reason === 'win'),
        'fin naturelle de la partie restaurée',
        60_000,
    );
});

/** Variante restaurable : red est un vrai humain (validateSnapshot exige au
 *  moins un joueur humain non-bot). */
function validSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
    const snap = baseSnapshot(overrides);
    snap.players[0] = { ...snap.players[0]!, isHuman: true, userId: 'u-human' };
    return snap;
}

test('validateSnapshot — accepte un snapshot sain', () => {
    assert.equal(validateSnapshot(validSnapshot()), null);
});

test('validateSnapshot — rejette version de schéma, âge, forme et partie gagnée', () => {
    assert.match(validateSnapshot(validSnapshot({ schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 }))!, /schemaVersion/);
    assert.match(validateSnapshot(validSnapshot({ savedAt: Date.now() - 10 * 60_000 }))!, /trop ancien/);
    assert.match(validateSnapshot(validSnapshot({ startTime: Date.now() - 4 * 60 * 60_000 }))!, /trop ancienne/);
    assert.match(validateSnapshot(validSnapshot({ players: validSnapshot().players.slice(0, 3) }))!, /players/);
    assert.match(validateSnapshot(validSnapshot({ currentPlayerIndex: 7 }))!, /index/);

    // Plateau gagné (1v3) : les 4 pions rouges sur les cases d'arrivée.
    const won = validSnapshot();
    won.players[0]!.marblePositions = [...ARRIVAL_POSITIONS.red];
    assert.match(validateSnapshot(won)!, /gagnée/);
});

test('validateSnapshot — rejette une partie sans humain réel (que des agents IA)', () => {
    // IA internes uniquement (isHuman false) : partie DEBUG, jamais restaurée.
    assert.match(validateSnapshot(baseSnapshot())!, /humain/);
    // Sièges agents externes uniquement (isHuman true mais isBot) : partie
    // fantôme 100% bots, la restaurer re-dispatcherait des agents pour rien.
    const botsOnly = baseSnapshot();
    botsOnly.players = botsOnly.players.map((p, i) => ({
        ...p, isHuman: true, isBot: true, userId: String(20 + i),
    }));
    assert.match(validateSnapshot(botsOnly)!, /humain/);
});
