// ─────────────────────────────────────────────────────────────────────────────
// Script d'arrivée de la file publique : tirages bornés, variés, reproductibles.
// Pur : aucun timer, aucune socket. Des milliers de graines par cas.
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { planArrivals, describeScript, seededRng, SCRIPT, type ArrivalScript } from './matchmaking-script.js';

const SEEDS = 4_000;

function scripts(seatsToFill: number, newcomer: boolean, count = SEEDS): ArrivalScript[] {
    const out: ArrivalScript[] = [];
    for (let seed = 1; seed <= count; seed++) out.push(planArrivals({ seatsToFill, newcomer, rng: seededRng(seed) }));
    return out;
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
}

const dispatches = (s: ArrivalScript) => s.events.filter(e => e.kind === 'dispatch');

test('script — même graine, même script', () => {
    for (const newcomer of [false, true]) {
        for (let seed = 1; seed <= 50; seed++) {
            const a = planArrivals({ seatsToFill: 3, newcomer, rng: seededRng(seed) });
            const b = planArrivals({ seatsToFill: 3, newcomer, rng: seededRng(seed) });
            assert.deepEqual(a, b);
        }
    }
});

test('script — exactement un dispatch par siège, le dernier sans hold', () => {
    for (const newcomer of [false, true]) {
        for (const n of [1, 2, 3]) {
            for (const s of scripts(n, newcomer, 1_000)) {
                const d = dispatches(s);
                assert.equal(d.length, n, describeScript(s));
                assert.equal(d.at(-1)!.kind === 'dispatch' && d.at(-1)!.hold, false, describeScript(s));
                for (const e of d.slice(0, -1)) assert.equal(e.kind === 'dispatch' && e.hold, true, describeScript(s));
                for (let i = 1; i < s.events.length; i++) assert.ok(s.events[i]!.at >= s.events[i - 1]!.at, 'événements triés');
                for (const e of s.events) assert.ok(Number.isInteger(e.at) && e.at >= 0, `at valide : ${describeScript(s)}`);
            }
        }
    }
});

test('script — nouveau joueur : file presque pleine d\'emblée, partie en 3 à 9 s', () => {
    const all = scripts(3, true);
    let twoAlready = 0;
    for (const s of all) {
        assert.equal(s.archetype, 'newcomer');
        assert.deepEqual(s.overlays, { leaver: false, switch: false, slowTail: false });
        assert.ok(s.events.every(e => e.kind === 'dispatch'), 'ni fantôme ni changement de siège');
        assert.ok(s.fullAt >= SCRIPT.NEWCOMER_MIN_MS && s.fullAt <= SCRIPT.NEWCOMER_MAX_MS, describeScript(s));
        const atZero = dispatches(s).filter(e => e.at === 0).length;
        assert.ok(atZero >= 1, describeScript(s));
        if (atZero === 2) twoAlready++;
    }
    const share = twoAlready / all.length;
    assert.ok(share > 0.80 && share < 0.90, `3/4 dès l'arrivée : ${share}`);
});

test('script — joueur régulier : plafond 45 s, médiane raisonnable', () => {
    for (const n of [1, 2, 3]) {
        for (const s of scripts(n, false)) {
            assert.ok(s.fullAt <= SCRIPT.REGULAR_CAP_MS + SCRIPT.AGENT_LATENCY_ESTIMATE_MS, describeScript(s));
        }
    }
    const full = scripts(3, false).map(s => s.fullAt);
    const m = median(full);
    assert.ok(m >= 10_000 && m <= 30_000, `médiane plein : ${m} ms`);
});

test('script — archétypes et surcouches dans les proportions prévues', () => {
    const all = scripts(3, false);
    const share = (pred: (s: ArrivalScript) => boolean) => all.filter(pred).length / all.length;
    const near = (value: number, expected: number, tolerance: number, label: string) =>
        assert.ok(Math.abs(value - expected) <= tolerance, `${label} : ${value.toFixed(3)} (attendu ~${expected})`);

    near(share(s => s.archetype === 'lobby'), 0.35, 0.03, 'lobby');
    near(share(s => s.archetype === 'trickle'), 0.35, 0.03, 'trickle');
    near(share(s => s.archetype === 'group'), 0.15, 0.03, 'group');
    near(share(s => s.archetype === 'lateStart'), 0.15, 0.03, 'lateStart');
    near(share(s => s.overlays.slowTail), 0.10, 0.02, 'queue lente');
    near(share(s => s.overlays.switch), 0.12, 0.03, 'changement de siège');
    // Une fenêtre trop courte supprime certains fantômes : ≤ 20 %.
    const leaver = share(s => s.overlays.leaver);
    assert.ok(leaver >= 0.08 && leaver <= 0.21, `fantôme : ${leaver}`);
});

test('script — un seul siège : ni fantôme, ni siège pris d\'avance, ni duo', () => {
    for (const s of scripts(1, false, 1_000)) {
        assert.ok(s.archetype !== 'lobby' && s.archetype !== 'group', describeScript(s));
        assert.equal(s.overlays.leaver, false);
    }
});

test('script — fenêtres du fantôme et du changement de siège', () => {
    for (const s of scripts(3, false)) {
        const d = dispatches(s);
        const leaver = s.events.find(e => e.kind === 'leaver');
        if (leaver && leaver.kind === 'leaver') {
            // Avant l'avant-dernier siège : au plus 2 sièges visibles quand il arrive.
            assert.ok(leaver.at >= 800 && leaver.at < d[1]!.at, describeScript(s));
            assert.ok(leaver.lingerMs >= 1_500 && leaver.lingerMs <= 8_000, describeScript(s));
        }
        const sw = s.events.find(e => e.kind === 'switch');
        if (sw) assert.ok(sw.at > d[0]!.at && sw.at < s.fullAt, describeScript(s));
    }
});

test('script — lobby : quelqu\'un attend déjà ; group : deux arrivées rapprochées', () => {
    for (const s of scripts(3, false)) {
        const d = dispatches(s);
        if (s.archetype === 'lobby') assert.equal(d[0]!.at, 0, describeScript(s));
        if (s.archetype === 'trickle' || s.archetype === 'lateStart') assert.ok(d[0]!.at >= 1_000, describeScript(s));
        if (s.archetype === 'group' && !s.overlays.slowTail) {
            // Visibles : holds à `at`, dernier siège à `at` + latence.
            const visible = [d[0]!.at, d[1]!.at, d[2]!.at + SCRIPT.AGENT_LATENCY_ESTIMATE_MS];
            const closest = Math.min(visible[1]! - visible[0]!, visible[2]! - visible[1]!);
            assert.ok(closest <= 1_500 + SCRIPT.AGENT_LATENCY_ESTIMATE_MS, describeScript(s));
        }
    }
});

test('script — générateurs extrêmes : jamais de NaN', () => {
    for (const rng of [() => 0, () => 0.999999]) {
        for (const newcomer of [false, true]) {
            for (const n of [1, 2, 3]) {
                const s = planArrivals({ seatsToFill: n, newcomer, rng });
                assert.ok(Number.isFinite(s.fullAt), describeScript(s));
                assert.equal(dispatches(s).length, n);
                for (const e of s.events) assert.ok(Number.isFinite(e.at) && e.at >= 0, describeScript(s));
            }
        }
    }
});
