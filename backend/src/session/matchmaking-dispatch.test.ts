// ─────────────────────────────────────────────────────────────────────────────
// File publique hors TRAIN_MODE : exécution du script d'arrivée, sièges
// réservés (holds), dispatches d'agents IA, et les courses entre arrivées,
// départs et lancement. Dispatch, hasard, script et lancement sont injectés ;
// les timers sont simulés (t.mock.timers).
// ─────────────────────────────────────────────────────────────────────────────

delete process.env['TELEGRAM_BOT_TOKEN'];
delete process.env['TELEGRAM_CHAT_ID'];

import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { MatchmakingManager, type LaunchRequest } from './matchmaking-manager.js';
import { planArrivals, seededRng, type ArrivalScript, type ScriptEvent } from './matchmaking-script.js';
import type { DispatchResult } from './bot-dispatch.js';
import type { MarbleColor, MatchmakingStatusMessage, ServerMessage } from '@mercury/shared';

type Listener = (event: unknown) => void;

/** Fausse WebSocket : readyState, envois capturés, close() synchrone comme `ws`. */
function fakeWs() {
    const listeners = new Map<string, Set<Listener>>();
    const sent: ServerMessage[] = [];
    let closedWith: number | null = null;
    const fire = (type: string, event: unknown) => { for (const fn of [...(listeners.get(type) ?? [])]) fn(event); };
    const ws = {
        readyState: 1,
        addEventListener: (type: string, fn: Listener) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(fn);
        },
        removeEventListener: (type: string, fn: Listener) => { listeners.get(type)?.delete(fn); },
        send: (data: string) => { sent.push(JSON.parse(data) as ServerMessage); },
        close: (code?: number) => {
            if (ws.readyState === 3) return;
            ws.readyState = 3;
            closedWith = code ?? 1005;
            fire('close', { code: closedWith, reason: '' });
        },
    };
    return {
        ws: ws as unknown as WebSocket,
        sent,
        get closedWith() { return closedWith; },
        /** Coupure réseau côté client. */
        drop: () => { ws.readyState = 3; fire('close', { code: 1006, reason: '' }); },
        /** Fermeture amorcée, événement close pas encore reçu. */
        closing: () => { ws.readyState = 2; },
        select: (color: MarbleColor) => fire('message', { data: JSON.stringify({ type: 'selectMatchmakingSlot', color }) }),
        statuses: () => sent.filter((m): m is MatchmakingStatusMessage => m.type === 'matchmakingStatus'),
        lastStatus: () => sent.filter((m): m is MatchmakingStatusMessage => m.type === 'matchmakingStatus').at(-1),
        lastRejection: () => sent.filter(m => m.type === 'actionRejected').at(-1),
    };
}
type FakeWs = ReturnType<typeof fakeWs>;

function forced(events: ScriptEvent[]): ArrivalScript {
    return { archetype: 'trickle', events, overlays: { leaver: false, switch: false, slowTail: false }, fullAt: 0 };
}

const H = (at: number): ScriptEvent => ({ at, kind: 'dispatch', hold: true });
const D = (at: number): ScriptEvent => ({ at, kind: 'dispatch', hold: false });
const L = (at: number, lingerMs: number): ScriptEvent => ({ at, kind: 'leaver', lingerMs });
const S = (at: number): ScriptEvent => ({ at, kind: 'switch' });

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

interface HarnessOptions {
    script?: ScriptEvent[];
    train?: boolean;
    seed?: number;
}

function harness(t: TestContext, options: HarnessOptions = {}) {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const calls: Array<{ avoid: readonly string[]; resolve: (r: DispatchResult) => void; settled: boolean }> = [];
    const launches: LaunchRequest[] = [];
    const rng = seededRng(options.seed ?? 7);
    const mm = new MatchmakingManager({
        dispatch: (avoid) => new Promise<DispatchResult>(resolve => {
            const call = { avoid, settled: false, resolve: (r: DispatchResult) => { call.settled = true; resolve(r); } };
            calls.push(call);
        }),
        rng,
        isBot: (userId) => userId?.startsWith('bot-') ?? false,
        trainMode: () => options.train ?? false,
        plan: (input) => options.script ? forced(options.script) : planArrivals(input),
        startGame: (launch) => { launches.push(launch); },
    });
    let botCount = 0;
    const human = (name: string, extra: { preferredColor?: MarbleColor; newcomer?: boolean; userId?: string } = {}): FakeWs => {
        const f = fakeWs();
        mm.joinQueue({ ws: f.ws, playerName: name, browserId: `browser-${name}`, ...extra });
        return f;
    };
    const bot = (): FakeWs => {
        const f = fakeWs();
        const id = `bot-${++botCount}`;
        mm.joinQueue({ ws: f.ws, playerName: id, userId: id });
        return f;
    };
    /** Avance par pas de 50 ms : mock.timers fige Date.now() en fin de tick. */
    const advance = async (ms: number) => {
        for (let elapsed = 0; elapsed < ms; elapsed += 50) {
            t.mock.timers.tick(Math.min(50, ms - elapsed));
            await flush();
        }
    };
    const resolveAll = async (result: DispatchResult) => {
        for (const call of calls) if (!call.settled) call.resolve(result);
        await flush();
    };
    return { mm, calls, launches, human, bot, advance, resolveAll };
}

function checkInvariants(mm: MatchmakingManager, train = false): void {
    const state = mm.inspect();
    if (!state) return;
    const colors = [...state.players.map(p => p.color), ...state.holds.map(h => h.color)];
    assert.equal(new Set(colors).size, colors.length, `couleurs uniques : ${colors.join(',')}`);
    assert.ok(state.players.length + state.pending <= 4, 'pas de sur-dispatch');
    if (state.holds.length > 0) assert.ok(state.players.length + state.holds.length <= 3, 'jamais 4/4 sans 4 sockets');
    assert.ok(state.holds.filter(h => h.kind === 'incoming').length <= state.pending, 'hold incoming sans dispatch');
    assert.ok(state.players.length < 4, 'session pleine non lancée');
    if (!train) assert.ok(state.players.some(p => !p.isBot), 'session sans humain');
}

test('dispatch — un agent sans humain en file est renvoyé, sans créer de session', (t) => {
    const { mm, bot } = harness(t);
    const b = bot();
    assert.equal(b.closedWith, 1000);
    assert.equal(b.lastRejection()?.type, 'actionRejected');
    assert.equal(mm.inspect(), null);
});

test('dispatch — sièges réservés visibles dès le premier statut, lancement à 4 sockets', async (t) => {
    const { mm, calls, launches, human, bot, advance, resolveAll } = harness(t, { script: [H(0), H(0), D(4_000)] });
    const alice = human('alice', { preferredColor: 'orange' });

    const first = alice.statuses()[0]!;
    assert.equal(alice.statuses().length, 1, 'un seul statut à l\'arrivée');
    assert.equal(first.connectedCount, 3, '3/4 dès l\'arrivée');
    assert.equal(first.myColor, 'orange', 'couleur préférée honorée');
    assert.equal(calls.length, 2, 'deux agents appelés à t=0');
    await resolveAll('ok');
    checkInvariants(mm);

    const held = mm.inspect()!.holds.map(h => h.color);
    const b1 = bot();
    const b2 = bot();
    const state = mm.inspect()!;
    assert.deepEqual(state.holds, []);
    assert.deepEqual(state.players.filter(p => p.isBot).map(p => p.color).sort(), [...held].sort(), 'les agents prennent les sièges réservés');
    assert.equal(alice.lastStatus()!.connectedCount, 3, 'rien ne bouge à l\'écran');
    checkInvariants(mm);

    await advance(4_000);
    assert.equal(calls.length, 3, 'dernier agent appelé à 4 s');
    bot();
    assert.equal(launches.length, 1);
    assert.equal(launches[0]!.players.length, 4);
    assert.deepEqual(launches[0]!.players.map(p => p.color), ['red', 'green', 'blue', 'orange']);
    assert.equal(mm.inspect(), null);
    assert.equal(b1.closedWith, null);
    assert.equal(b2.closedWith, null);
    assert.equal(alice.lastStatus()!.connectedCount, 4, '4/4 diffusé au lancement');
});

test('dispatch — le premier humain n\'est pas toujours rouge', (t) => {
    const colors = new Set<MarbleColor>();
    for (let seed = 1; seed <= 20; seed++) {
        const { human, mm } = harness(t, { seed, script: [D(60_000), D(60_000), D(60_000)] });
        colors.add(human('alice').lastStatus()!.myColor);
        mm.inspect();
        t.mock.timers.reset();
    }
    assert.ok(colors.size >= 3, `couleurs vues : ${[...colors].join(',')}`);
});

test('dispatch — jamais 4/4 affiché sans 4 sockets', async (t) => {
    const { mm, launches, human, bot } = harness(t, { script: [H(0), H(0), H(0)] });
    const alice = human('alice');
    assert.equal(alice.lastStatus()!.connectedCount, 3, 'le 3e hold est rétrogradé');
    assert.equal(mm.inspect()!.pending, 3);
    bot();
    bot();
    assert.equal(launches.length, 0);
    assert.ok(alice.statuses().slice(0, -1).every(s => s.connectedCount <= 3));
    bot();
    assert.equal(launches.length, 1);
});

test('dispatch — agent hors script accepté, dispatch scripté devenu inutile', async (t) => {
    const { mm, calls, human, bot, advance } = harness(t, { script: [H(5_000), H(8_000), D(12_000)] });
    human('alice');
    assert.equal(calls.length, 0);
    await advance(1_000);
    bot(); // re-seat d'une partie restaurée, par exemple
    assert.equal(mm.inspect()!.players.length, 2);
    await advance(12_500);
    assert.equal(calls.length, 2, 'le 3e dispatch scripté ne part pas');
    checkInvariants(mm);
});

test('dispatch — agent surnuméraire après le lancement : renvoyé', async (t) => {
    const { mm, launches, human, bot } = harness(t, { script: [H(0), H(0), D(0)] });
    human('alice');
    bot(); bot(); bot();
    assert.equal(launches.length, 1);
    const late = bot();
    assert.equal(late.closedWith, 1000);
    assert.equal(mm.inspect(), null);
});

test('dispatch — un humain passe avant un siège réservé', async (t) => {
    const { mm, calls, launches, human, bot, advance } = harness(t, { script: [H(0), H(0), D(5_000)] });
    human('alice');
    const held = mm.inspect()!.holds[0]!.color;
    const fb = fakeWs();
    mm.joinGroup([{ ws: fb.ws, playerName: 'bob', browserId: 'browser-bob', preferredColor: held }]);
    assert.equal(fb.lastStatus()!.myColor, held);
    assert.equal(mm.inspect()!.holds.length, 1);
    assert.equal(mm.inspect()!.pending, 2, 'le dispatch du siège évincé est conservé');
    checkInvariants(mm);
    bot(); bot();
    assert.equal(launches.length, 1);
    await advance(6_000);
    assert.equal(calls.length, 2, 'aucun agent en trop');
});

test('dispatch — départ du dernier humain : les agents repartent, plus de session', async (t) => {
    const { mm, calls, human, bot, advance, resolveAll } = harness(t, { script: [H(0), H(0), D(5_000)] });
    const alice = human('alice');
    const b1 = bot();
    alice.drop();
    assert.equal(b1.closedWith, 1000);
    assert.equal(mm.inspect(), null);
    await resolveAll('ok');
    await advance(10_000);
    assert.equal(calls.length, 2, 'le script est annulé');
    const late = bot();
    assert.equal(late.closedWith, 1000);
    assert.equal(mm.inspect(), null);
});

test('dispatch — annulation pendant le dispatch de t=0', async (t) => {
    const { mm, calls, human, advance, resolveAll } = harness(t, { script: [H(0), H(0), D(5_000)] });
    human('alice').drop();
    await resolveAll('busy');
    await advance(60_000);
    assert.equal(calls.length, 2);
    assert.equal(mm.inspect(), null);
});

test('dispatch — pool occupé : le siège réservé « repart », nouvel essai après backoff', async (t) => {
    const { mm, calls, human, advance } = harness(t, { script: [H(0), D(60_000), D(60_000)] });
    const alice = human('alice');
    assert.equal(alice.lastStatus()!.connectedCount, 2);
    calls[0]!.resolve('busy');
    await flush();
    await advance(500);
    assert.equal(alice.lastStatus()!.connectedCount, 2, 'le fantôme reste un instant');
    await advance(2_600);
    assert.equal(alice.lastStatus()!.connectedCount, 1, 'puis repart');
    assert.equal(calls.length, 1, 'pas de nouvel essai avant le backoff');
    await advance(10_000);
    assert.equal(calls.length, 2, 'nouvel essai');
    checkInvariants(mm);
});

test('dispatch — agent jamais arrivé : siège libéré après 15 s, rattrapage', async (t) => {
    const { mm, calls, human, advance, resolveAll } = harness(t, { script: [H(0), D(60_000), D(60_000)] });
    const alice = human('alice');
    await resolveAll('ok');
    await advance(14_900);
    assert.equal(alice.lastStatus()!.connectedCount, 2);
    await advance(3_200);
    assert.equal(alice.lastStatus()!.connectedCount, 1);
    await advance(12_000);
    assert.equal(calls.length, 2, 'un agent de remplacement est appelé');
    checkInvariants(mm);
});

test('dispatch — un siège réservé se refuse comme un siège pris', (t) => {
    const { mm, human } = harness(t, { script: [H(0), D(60_000), D(60_000)] });
    const alice = human('alice');
    const held = mm.inspect()!.holds[0]!.color;
    alice.select(held);
    assert.deepEqual(alice.lastRejection(), { type: 'actionRejected', reason: 'This seat is already taken' });
    const free = (['red', 'green', 'blue', 'orange'] as const).find(c => c !== held && c !== alice.lastStatus()!.myColor)!;
    alice.select(free);
    assert.equal(alice.lastStatus()!.myColor, free);
});

test('dispatch — changement de siège scripté, suspendu juste après un choix humain', async (t) => {
    const moved = harness(t, { script: [H(0), S(3_000), D(60_000), D(60_000)] });
    moved.human('alice');
    const before = moved.mm.inspect()!.holds[0]!.color;
    await moved.advance(3_050);
    assert.notEqual(moved.mm.inspect()!.holds[0]!.color, before, 'le siège a changé');
    checkInvariants(moved.mm);
    t.mock.timers.reset();

    const blocked = harness(t, { script: [H(0), S(3_000), D(60_000), D(60_000)] });
    const bob = blocked.human('bob');
    const held = blocked.mm.inspect()!.holds[0]!.color;
    await blocked.advance(2_500);
    const free = (['red', 'green', 'blue', 'orange'] as const).find(c => c !== held && c !== bob.lastStatus()!.myColor)!;
    bob.select(free);
    await blocked.advance(600);
    assert.equal(blocked.mm.inspect()!.holds[0]!.color, held, 'pas de changement dans les 3 s');
});

test('dispatch — humain en cours de fermeture à l\'arrivée du 4e agent : pas de lancement', async (t) => {
    const { mm, launches, human, bot, advance } = harness(t, { script: [H(0), H(0), D(5_000)] });
    const alice = human('alice');
    const b1 = bot();
    const b2 = bot();
    alice.closing();
    await advance(5_000);
    const b3 = bot();
    assert.equal(launches.length, 0);
    assert.equal(mm.inspect(), null);
    for (const b of [b1, b2, b3]) assert.equal(b.closedWith, 1000);
});

test('dispatch — fantôme : apparaît puis repart, écarté si la file paraîtrait pleine', async (t) => {
    const solo = harness(t, { script: [L(1_000, 2_000), D(60_000), D(60_000), D(60_000)] });
    const alice = solo.human('alice');
    await solo.advance(1_050);
    assert.equal(alice.lastStatus()!.connectedCount, 2);
    await solo.advance(2_000);
    assert.equal(alice.lastStatus()!.connectedCount, 1);
    t.mock.timers.reset();

    const crowded = harness(t, { script: [H(0), L(1_000, 10_000), D(2_000), D(2_500)] });
    const bob = crowded.human('bob');
    await crowded.advance(2_600);
    assert.equal(bob.lastStatus()!.connectedCount, 3);
    crowded.bot();
    crowded.bot();
    assert.equal(bob.lastStatus()!.connectedCount, 3, 'le fantôme cède sa place');
    assert.deepEqual(crowded.mm.inspect()!.holds, []);
    crowded.bot();
    assert.equal(crowded.launches.length, 1);
});

test('dispatch — un second humain prend la dernière place pendant qu\'un agent arrive', async (t) => {
    const { mm, launches, human, bot } = harness(t, { script: [H(0), H(0), D(5_000)] });
    human('alice');
    bot();
    const bob = human('bob');
    assert.equal(bob.lastStatus()!.connectedCount, 3, 'pas de 4/4 sans 4 sockets');
    checkInvariants(mm);
    bot();
    assert.equal(launches.length, 1);
});

test('dispatch — TRAIN_MODE : agents acceptés sans humain, aucun dispatch', (t) => {
    const { mm, calls, launches, bot } = harness(t, { train: true });
    bot(); bot(); bot();
    assert.equal(mm.inspect()!.players.length, 3);
    bot();
    assert.equal(launches.length, 1);
    assert.deepEqual(launches[0]!.players.map(p => p.name), ['bot-1', 'bot-2', 'bot-3', 'bot-4']);
    assert.equal(calls.length, 0);
});

test('dispatch — getTakenColors ignore les sièges réservés', (t) => {
    const { mm, human } = harness(t, { script: [H(0), H(0), D(60_000)] });
    const alice = human('alice');
    assert.deepEqual([...mm.getTakenColors()], [alice.lastStatus()!.myColor]);
});

test('dispatch — les bots croisés récemment sont transmis à l\'agent', async (t) => {
    const { calls, human, bot, resolveAll } = harness(t, { script: [H(0), H(0), D(0)] });
    human('alice', { userId: 'u-alice' });
    await resolveAll('ok');
    bot(); bot(); bot();
    human('alice', { userId: 'u-alice' });
    assert.deepEqual([...calls.at(-1)!.avoid].sort(), ['bot-1', 'bot-2', 'bot-3']);
});

test('dispatch — fuzz : les invariants tiennent sur 500 opérations', async (t) => {
    for (const seed of [11, 23, 37]) {
        const { mm, calls, launches, human, bot, advance } = harness(t, { seed });
        const ops = seededRng(seed * 101);
        const humans: FakeWs[] = [];
        let humanCount = 0;
        for (let i = 0; i < 500; i++) {
            const r = ops();
            if (r < 0.12) {
                humans.push(human(`h${++humanCount}`, { newcomer: ops() < 0.3 }));
            } else if (r < 0.22 && humans.length > 0) {
                humans.splice(Math.floor(ops() * humans.length), 1)[0]!.drop();
            } else if (r < 0.45) {
                bot();
            } else if (r < 0.60) {
                const open = calls.filter(c => !c.settled);
                if (open.length > 0) {
                    const pick = ops();
                    open[Math.floor(ops() * open.length)]!.resolve(pick < 0.7 ? 'ok' : pick < 0.85 ? 'busy' : 'failed');
                    await flush();
                }
            } else if (r < 0.70 && humans.length > 0) {
                const colors = ['red', 'green', 'blue', 'orange'] as const;
                humans[Math.floor(ops() * humans.length)]!.select(colors[Math.floor(ops() * 4)]!);
            } else {
                await advance(50 + Math.floor(ops() * 3_000));
            }
            checkInvariants(mm);
        }
        assert.ok(launches.length > 0, `graine ${seed} : aucune partie lancée`);
        for (const launch of launches) assert.equal(new Set(launch.players.map(p => p.color)).size, 4);
        t.mock.timers.reset();
    }
});
