// ─────────────────────────────────────────────────────────────────────────────
// Persona d'un agent IA : ses habitudes, les mêmes à chaque partie.
//
// Stockée sur son document Users (`botPersona`), lue par le service d'agents
// (projet ia) via GET /api/auth/bots. Un bot ajouté en base par
// scripts/add-bot.ts est donc jouable sans redéploiement, avec son caractère.
//
//  - style / chattiness : discret à bavard, multiplie ses probabilités de réaction ;
//  - owned : emojis de boutique qu'il « possède » (le serveur laisse passer les
//    emojis payants d'un siège de bot, cf. Game.handleReaction) ;
//  - favorite : emoji fétiche, favorisé quand il fait partie des réponses ;
//  - pace : multiplie son temps de réflexion.
//
// Les paliers et leurs parts sont ceux de persona.py (projet ia), qui a tiré
// les 27 premières personas : les garder alignés.
// ─────────────────────────────────────────────────────────────────────────────

import {
    FREE_BOOST_SLOTS,
    REACTION_EMOJIS,
    emojiItemId,
    getConsumable,
    isFreeEmoji,
    type ConsumableId,
    type ReactionEmoji,
} from '@mercury/shared';

export type BotStyle = 'silent' | 'quiet' | 'normal' | 'chatty';
export type OwnershipTier = 'none' | 'few' | 'many';

export interface BotPersona {
    style: BotStyle;
    chattiness: number;
    /** Emojis de boutique possédés (jamais un gratuit). */
    owned: ReactionEmoji[];
    favorite: ReactionEmoji | null;
    pace: number;
}

interface Tier<T extends string> {
    name: T;
    share: number;
}

export const STYLE_TIERS: ReadonlyArray<Tier<BotStyle> & { chattiness: number }> = [
    { name: 'silent', chattiness: 0.15, share: 0.20 },
    { name: 'quiet', chattiness: 0.5, share: 0.30 },
    { name: 'normal', chattiness: 1.0, share: 0.30 },
    { name: 'chatty', chattiness: 2.0, share: 0.20 },
];

export const OWNERSHIP_TIERS: ReadonlyArray<Tier<OwnershipTier> & { min: number; max: number }> = [
    { name: 'none', min: 0, max: 0, share: 0.45 },
    { name: 'few', min: 1, max: 2, share: 0.35 },
    { name: 'many', min: 3, max: 6, share: 0.20 },
];

export const PACE_MIN = 0.75;
export const PACE_MAX = 1.35;
/** Un bot sur deux a un emoji fétiche. */
const FAVORITE_CHANCE = 0.5;

/** Dérivés du catalogue partagé : jamais recopiés. */
export const FREE_EMOJIS: readonly ReactionEmoji[] = REACTION_EMOJIS.filter(isFreeEmoji);
export const PAID_EMOJIS: readonly ReactionEmoji[] = REACTION_EMOJIS.filter(e => !isFreeEmoji(e));

export function ownershipOf(persona: Pick<BotPersona, 'owned'>): OwnershipTier {
    const n = persona.owned.length;
    return OWNERSHIP_TIERS.find(t => n >= t.min && n <= t.max)?.name ?? 'many';
}

/**
 * Palier du prochain bot : celui qui manque le plus pour que le pool entier
 * colle aux parts visées (un tirage indépendant peut donner 2 bavards sur 27).
 * Égalités départagées au hasard.
 */
export function quotaPick<T extends string>(tiers: ReadonlyArray<Tier<T>>, existing: readonly T[], rng: () => number): T {
    const total = existing.length + 1;
    const deficits = tiers.map(t => ({ name: t.name, deficit: t.share * total - existing.filter(e => e === t.name).length }));
    const best = Math.max(...deficits.map(d => d.deficit));
    const tied = deficits.filter(d => best - d.deficit < 1e-9);
    return tied[Math.floor(rng() * tied.length)]!.name;
}

function sample<T>(items: readonly T[], count: number, rng: () => number): T[] {
    const pool = [...items];
    const out: T[] = [];
    while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
    return out;
}

export interface PersonaOverrides {
    style?: BotStyle | undefined;
    owned?: readonly ReactionEmoji[] | undefined;
    /** `null` : pas d'emoji fétiche. */
    favorite?: ReactionEmoji | null | undefined;
    pace?: number | undefined;
}

/**
 * Persona d'un nouveau bot : les traits imposés sont gardés, les autres tirés
 * (style et nombre d'emojis possédés par quotas sur les bots existants).
 */
export function buildPersona(overrides: PersonaOverrides, existing: readonly BotPersona[], rng: () => number): BotPersona {
    const style = overrides.style ?? quotaPick(STYLE_TIERS, existing.map(p => p.style), rng);
    const chattiness = STYLE_TIERS.find(t => t.name === style)!.chattiness;

    let owned: ReactionEmoji[];
    if (overrides.owned) {
        owned = [...new Set(overrides.owned)];
    } else {
        const tierName = quotaPick(OWNERSHIP_TIERS, existing.map(ownershipOf), rng);
        const tier = OWNERSHIP_TIERS.find(t => t.name === tierName)!;
        owned = sample(PAID_EMOJIS, tier.min + Math.floor(rng() * (tier.max - tier.min + 1)), rng);
    }
    owned.sort((a, b) => REACTION_EMOJIS.indexOf(a) - REACTION_EMOJIS.indexOf(b));

    const usable = [...FREE_EMOJIS, ...owned];
    const favorite = overrides.favorite !== undefined
        ? overrides.favorite
        : rng() < FAVORITE_CHANCE ? usable[Math.floor(rng() * usable.length)]! : null;

    const pace = overrides.pace ?? Math.round((PACE_MIN + (PACE_MAX - PACE_MIN) * rng()) * 100) / 100;

    const persona = { style, chattiness, owned, favorite, pace };
    const problem = personaProblem(persona);
    if (problem) throw new Error(`Persona invalide : ${problem}`);
    return persona;
}

/** Raison pour laquelle une persona est invalide, ou null si elle est valide. */
export function personaProblem(p: BotPersona): string | null {
    const tier = STYLE_TIERS.find(t => t.name === p.style);
    if (!tier) return `style inconnu « ${p.style} »`;
    if (tier.chattiness !== p.chattiness) return `chattiness ${p.chattiness} ≠ ${tier.chattiness} pour « ${p.style} »`;
    const notPaid = p.owned.filter(e => !PAID_EMOJIS.includes(e));
    if (notPaid.length > 0) return `owned ne contient que des emojis de boutique (${notPaid.join(' ')})`;
    if (p.favorite !== null && !FREE_EMOJIS.includes(p.favorite) && !p.owned.includes(p.favorite)) {
        return `emoji fétiche ${p.favorite} ni gratuit ni possédé`;
    }
    if (!(p.pace >= PACE_MIN && p.pace <= PACE_MAX)) return `pace ${p.pace} hors de [${PACE_MIN}, ${PACE_MAX}]`;
    return null;
}

/** Lecture tolérante (document Users, personas.json) : null si absente ou invalide. */
export function parsePersona(raw: unknown): BotPersona | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r['owned'])) return null;
    const persona = {
        style: r['style'] as BotStyle,
        chattiness: Number(r['chattiness']),
        owned: r['owned'] as ReactionEmoji[],
        favorite: (r['favorite'] ?? null) as ReactionEmoji | null,
        pace: Number(r['pace']),
    };
    return personaProblem(persona) === null ? persona : null;
}

/** Ids catalogue des emojis possédés, pour `ownedItems` (même inventaire qu'un joueur). */
export function personaItemIds(persona: BotPersona): string[] {
    return persona.owned.map(e => emojiItemId(e)).filter((id): id is string => id !== undefined);
}

// ── Boosters d'un agent ───────────────────────────────────────────────────────
//
// Un vrai joueur montre sur son profil les boosters qu'il a équipés : un agent
// au profil toujours vide finirait par se remarquer. Chacun a donc un
// équipement fixe à vie, tiré de son id (pas de document à migrer, rien à
// aligner avec persona.py), qui s'applique en partie comme celui d'un joueur
// (Double Points double vraiment ses points au classement).
//
// Chaque booster est tiré indépendamment, avec sa propre chance : en ajouter
// un au catalogue ne change pas ceux déjà tirés, un agent peut simplement
// « l'acheter » à son tour. Les moins chers sont les plus répandus, comme chez
// les joueurs. Au plus un emplacement acheté (FREE_BOOST_SLOTS + 1).

/** Chance qu'un agent ait équipé chaque booster. Absent ici = jamais. */
const BOT_BOOST_ODDS: Readonly<Record<string, number>> = {
    'consumable.bounty': 0.35,
    'consumable.homecoming': 0.2,
    'consumable.double_strike': 0.2,
    'consumable.double_coins': 0.15,
    'consumable.double_points': 0.1,
    'consumable.perfect_game': 0.15,
};

const BOT_MAX_BOOSTS = FREE_BOOST_SLOTS + 1;

/** FNV-1a 32 bits ramené dans [0, 1) : stable d'un process à l'autre. */
function unitHash(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) / 0x100000000;
}

/** Boosters équipés d'un agent, toujours les mêmes pour un même id. */
export function botLoadout(userId: string): ConsumableId[] {
    const drawn = Object.entries(BOT_BOOST_ODDS)
        .map(([id, odds]) => ({ id, roll: unitHash(`${userId}:${id}`) / odds }))
        .filter(({ id, roll }) => roll < 1 && getConsumable(id) !== undefined)
        // Les plus « sûrs » d'abord : si plus de BOT_MAX_BOOSTS sont tirés,
        // on garde ceux dont le tirage passait le plus largement.
        .sort((a, b) => a.roll - b.roll)
        .slice(0, BOT_MAX_BOOSTS);
    return drawn.map(d => d.id as ConsumableId);
}
