// ─────────────────────────────────────────────────────────────────────────────
// Script d'arrivée de la file publique — pur, sans état ni timer.
//
// La file est presque toujours composée d'un humain seul et d'agents IA. Pour
// qu'elle ne suive pas toujours le même motif (1/4 → 2/4 → 3/4 → 4/4 à
// intervalles réguliers), chaque session tire un « script » : à quels
// instants les sièges paraissent occupés, si deux joueurs arrivent ensemble,
// si quelqu'un entre puis repart, si un joueur change de siège.
//
// Un siège « hold » s'affiche pris AVANT que le bot soit connecté : le bot est
// appelé au même instant et le remplit 1 à 3 s plus tard, sans que rien ne
// change à l'écran (billes anonymes). Le dernier siège n'est jamais un hold :
// le compteur n'affiche donc jamais 4/4 sans 4 vrais joueurs.
//
// MatchmakingManager exécute le script ; ce module ne fait que le tirer.
// ─────────────────────────────────────────────────────────────────────────────

export type ScriptEvent =
    /** Appelle un bot à `at`. `hold` : son siège s'affiche pris dès `at`. */
    | { at: number; kind: 'dispatch'; hold: boolean }
    /** Siège fantôme sans bot : paraît pris à `at`, se libère `lingerMs` plus tard. */
    | { at: number; kind: 'leaver'; lingerMs: number }
    /** Un joueur déjà assis (bot ou hold) change de siège. */
    | { at: number; kind: 'switch' };

export type Archetype = 'lobby' | 'trickle' | 'group' | 'lateStart' | 'newcomer';

export interface ArrivalScript {
    archetype: Archetype;
    /** Triés par `at` croissant (ms depuis le lancement du script). */
    events: ScriptEvent[];
    overlays: { leaver: boolean; switch: boolean; slowTail: boolean };
    /** Instant estimé où la file paraît pleine (latence d'arrivée du dernier bot comprise). */
    fullAt: number;
}

export interface PlanInput {
    /** Sièges à remplir par des bots (1 à 3). */
    seatsToFill: number;
    /** Nouveau joueur : file déjà presque pleine et partie lancée en 3 à 9 s. */
    newcomer: boolean;
    rng: () => number;
}

export const SCRIPT = {
    /** Plafond du temps de remplissage d'un joueur régulier. */
    REGULAR_CAP_MS: 45_000,
    NEWCOMER_MIN_MS: 3_000,
    NEWCOMER_MAX_MS: 9_000,
    /** Dispatch → bot assis (auth + WebSocket), à recalibrer d'après les logs de prod. */
    AGENT_LATENCY_ESTIMATE_MS: 1_500,
    GAP_MEDIAN_MS: 5_000,
    GAP_SIGMA: 0.6,
    GAP_MIN_MS: 1_200,
    GAP_MAX_MS: 15_000,
} as const;

const ARCHETYPE_WEIGHTS: ReadonlyArray<readonly [Exclude<Archetype, 'newcomer'>, number]> = [
    ['lobby', 0.35],
    ['trickle', 0.35],
    ['group', 0.15],
    ['lateStart', 0.15],
];
const LEAVER_CHANCE = 0.20;
const SWITCH_CHANCE = 0.12;
const SLOW_TAIL_CHANCE = 0.10;

export function uniform(rng: () => number, min: number, max: number): number {
    return min + (max - min) * rng();
}

/** Box-Muller sur `1 - rng()` : jamais log(0). */
function normal(rng: () => number): number {
    const u1 = 1 - rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function lognormal(rng: () => number, median: number, sigma: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, median * Math.exp(sigma * normal(rng))));
}

function gap(rng: () => number): number {
    return lognormal(rng, SCRIPT.GAP_MEDIAN_MS, SCRIPT.GAP_SIGMA, SCRIPT.GAP_MIN_MS, SCRIPT.GAP_MAX_MS);
}

function pickArchetype(rng: () => number, seatsToFill: number): Exclude<Archetype, 'newcomer'> {
    const r = rng();
    let acc = 0;
    let picked: Exclude<Archetype, 'newcomer'> = 'trickle';
    for (const [name, weight] of ARCHETYPE_WEIGHTS) {
        acc += weight;
        if (r < acc) { picked = name; break; }
    }
    // Un seul siège à remplir : ni siège déjà pris (ce serait un hold sur le
    // dernier siège), ni duo.
    if (seatsToFill < 2 && (picked === 'lobby' || picked === 'group')) return 'trickle';
    return picked;
}

/** Instants (ms) où chaque siège à remplir paraît occupé, croissants. */
function regularTargets(rng: () => number, n: number, archetype: Exclude<Archetype, 'newcomer'>): number[] {
    const t: number[] = [];
    switch (archetype) {
        case 'lobby': {
            // 1 ou 2 joueurs déjà là, jamais le dernier siège.
            const already = n === 3 ? (rng() < 0.5 ? 1 : 2) : 1;
            for (let i = 0; i < n; i++) t.push(i < already ? 0 : t[i - 1]! + gap(rng));
            break;
        }
        case 'trickle':
        case 'group': {
            for (let i = 0; i < n; i++) t.push(i === 0 ? uniform(rng, 2_000, 8_000) : t[i - 1]! + gap(rng));
            if (archetype === 'group') {
                // Deux joueurs qui arrivent presque ensemble (amis, « party »).
                const first = Math.floor(rng() * (n - 1));
                for (let i = first + 1; i < n; i++) {
                    t[i] = i === first + 1 ? t[first]! + uniform(rng, 300, 1_500) : t[i - 1]! + gap(rng);
                }
            }
            break;
        }
        case 'lateStart': {
            for (let i = 0; i < n; i++) {
                t.push(i === 0 ? uniform(rng, 8_000, 14_000) : t[i - 1]! + lognormal(rng, 3_000, 0.5, 800, 10_000));
            }
            break;
        }
    }
    return t;
}

function newcomerTargets(rng: () => number, n: number): number[] {
    const full = uniform(rng, SCRIPT.NEWCOMER_MIN_MS, SCRIPT.NEWCOMER_MAX_MS);
    if (n === 1) return [full];
    const already = n === 3 ? (rng() < 0.85 ? 2 : 1) : 1;
    const t: number[] = [];
    for (let i = 0; i < n - 1; i++) {
        // Le siège intermédiaire (n=3 et un seul déjà là) arrive assez tôt pour
        // que le dernier bot puisse être appelé après lui.
        t.push(i < already ? 0 : uniform(rng, 1_500, Math.max(1_500, full - SCRIPT.AGENT_LATENCY_ESTIMATE_MS)));
    }
    t.push(full);
    return t;
}

export function planArrivals({ seatsToFill, newcomer, rng }: PlanInput): ArrivalScript {
    const n = Math.max(1, Math.min(3, Math.floor(seatsToFill)));
    const archetype: Archetype = newcomer ? 'newcomer' : pickArchetype(rng, n);
    const overlays = { leaver: false, switch: false, slowTail: false };

    const targets = archetype === 'newcomer' ? newcomerTargets(rng, n) : regularTargets(rng, n, archetype);

    if (archetype !== 'newcomer') {
        if (rng() < SLOW_TAIL_CHANCE) {
            overlays.slowTail = true;
            targets[n - 1] = targets[n - 1]! + uniform(rng, 8_000, 20_000);
        }
        const last = targets[n - 1]!;
        if (last > SCRIPT.REGULAR_CAP_MS) {
            const scale = SCRIPT.REGULAR_CAP_MS / last;
            for (let i = 0; i < n; i++) targets[i] = targets[i]! * scale;
        }
    }

    const events: ScriptEvent[] = [];
    for (let i = 0; i < n - 1; i++) events.push({ at: targets[i]!, kind: 'dispatch', hold: true });
    // Le dernier bot est appelé en avance de sa latence, sans hold : le 4/4
    // ne s'affiche que quand il est réellement assis.
    const lastDispatchAt = Math.max(n >= 2 ? targets[n - 2]! : 0, targets[n - 1]! - SCRIPT.AGENT_LATENCY_ESTIMATE_MS);
    events.push({ at: lastDispatchAt, kind: 'dispatch', hold: false });

    if (archetype !== 'newcomer' && n >= 2) {
        // Quelqu'un entre puis repart, avant l'avant-dernier siège : au plus
        // 2 sièges visibles à ce moment, le fantôme ne prend jamais le dernier.
        const lo = 800;
        const hi = targets[n - 2]! - 500;
        if (rng() < LEAVER_CHANCE && hi > lo) {
            overlays.leaver = true;
            events.push({ at: uniform(rng, lo, hi), kind: 'leaver', lingerMs: Math.round(uniform(rng, 1_500, 8_000)) });
        }
    }
    if (archetype !== 'newcomer') {
        const lo = targets[0]! + 1_000;
        const hi = targets[n - 1]! - 1_000;
        if (rng() < SWITCH_CHANCE && hi > lo) {
            overlays.switch = true;
            events.push({ at: uniform(rng, lo, hi), kind: 'switch' });
        }
    }

    for (const e of events) e.at = Math.round(e.at);
    events.sort((a, b) => a.at - b.at);
    const fullAt = Math.round(Math.max(targets[n - 1]!, lastDispatchAt + SCRIPT.AGENT_LATENCY_ESTIMATE_MS));
    return { archetype, events, overlays, fullAt };
}

/** Une ligne de log : « lobby+leaver H@0 H@0 L@3.1s(4.2s) D@9.4s, plein ~10.9s ». */
export function describeScript(script: ArrivalScript): string {
    const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
    const tags = Object.entries(script.overlays).filter(([, on]) => on).map(([name]) => name);
    const steps = script.events.map(e => {
        if (e.kind === 'dispatch') return `${e.hold ? 'H' : 'D'}@${s(e.at)}`;
        if (e.kind === 'leaver') return `L@${s(e.at)}(${s(e.lingerMs)})`;
        return `S@${s(e.at)}`;
    });
    return `${[script.archetype, ...tags].join('+')} ${steps.join(' ')}, plein ~${s(script.fullAt)}`;
}

/** mulberry32 : générateur déterministe pour les tests et les simulations. */
export function seededRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
