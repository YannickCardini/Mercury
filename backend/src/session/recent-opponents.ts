// ─────────────────────────────────────────────────────────────────────────────
// Bots croisés récemment par chaque humain.
//
// Le pool d'agents compte une trentaine d'identités : tirées au hasard, les
// mêmes reviennent souvent d'une partie à l'autre pour un joueur qui enchaîne.
// Le matchmaking transmet cette liste à l'agent (dispatch), qui choisit
// d'abord une identité libre hors liste. Mémoire du process uniquement : un
// redémarrage l'efface, sans conséquence.
// ─────────────────────────────────────────────────────────────────────────────

interface Entry {
    botIds: string[];
    at: number;
}

export interface RecentOpponentsOptions {
    /** Bots retenus par humain (3 parties de 3 bots). */
    perHuman: number;
    ttlMs: number;
    /** Borne mémoire : les humains les plus anciens sont oubliés au-delà. */
    maxHumans: number;
}

const DEFAULTS: RecentOpponentsOptions = { perHuman: 9, ttlMs: 3 * 60 * 60_000, maxHumans: 2_000 };

export class RecentOpponents {
    private readonly byHuman = new Map<string, Entry>();
    private readonly options: RecentOpponentsOptions;

    constructor(options: Partial<RecentOpponentsOptions> = {}) {
        this.options = { ...DEFAULTS, ...options };
    }

    /** À l'issue d'un lancement : chaque humain retient les bots de sa table. */
    record(humanKeys: readonly string[], botIds: readonly string[], now = Date.now()): void {
        if (botIds.length === 0) return;
        for (const key of humanKeys) {
            const previous = this.fresh(key, now)?.botIds ?? [];
            const merged = [...botIds, ...previous.filter(id => !botIds.includes(id))].slice(0, this.options.perHuman);
            // delete + set : l'entrée repasse en fin d'ordre d'insertion (LRU).
            this.byHuman.delete(key);
            this.byHuman.set(key, { botIds: merged, at: now });
        }
        while (this.byHuman.size > this.options.maxHumans) {
            const oldest = this.byHuman.keys().next().value;
            if (oldest === undefined) break;
            this.byHuman.delete(oldest);
        }
    }

    /** Bots à éviter pour une table où attendent ces humains. */
    avoidFor(humanKeys: readonly string[], now = Date.now()): string[] {
        const ids = new Set<string>();
        for (const key of humanKeys) {
            for (const id of this.fresh(key, now)?.botIds ?? []) ids.add(id);
        }
        return [...ids];
    }

    private fresh(key: string, now: number): Entry | undefined {
        const entry = this.byHuman.get(key);
        if (!entry) return undefined;
        if (now - entry.at > this.options.ttlMs) {
            this.byHuman.delete(key);
            return undefined;
        }
        return entry;
    }
}
