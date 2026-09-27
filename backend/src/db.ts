import { CosmosClient, type Container, type PatchOperation } from '@azure/cosmos';

let client: CosmosClient | null = null;

function getClient(): CosmosClient {
    if (!client) {
        // L'émulateur Cosmos DB local utilise un certificat auto-signé
        if (process.env['NODE_ENV'] !== 'production') {
            process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
        }
        client = new CosmosClient(process.env['COSMOS_CONNECTION_STRING']!);
    }
    return client;
}

let usersContainer: Container | null = null;

export async function getUsersContainer(): Promise<Container> {
    if (usersContainer) return usersContainer;

    const { database } = await getClient().databases.createIfNotExists({ id: 'mercury-db' });
    const { container } = await database.containers.createIfNotExists({
        id: 'users',
        partitionKey: { paths: ['/id'] },
    });
    usersContainer = container;
    return container;
}

let messagesContainer: Container | null = null;

export async function getMessagesContainer(): Promise<Container> {
    if (messagesContainer) return messagesContainer;

    const { database } = await getClient().databases.createIfNotExists({ id: 'mercury-db' });
    const { container } = await database.containers.createIfNotExists({
        id: 'messages',
        partitionKey: { paths: ['/toUserId'] },
    });
    messagesContainer = container;
    return container;
}

export async function updateUserPoints(userId: string, delta: number): Promise<void> {
    const container = await getUsersContainer();
    const ops: PatchOperation[] = [{ op: 'incr', path: '/points', value: delta }];
    try {
        await container.item(userId, userId).patch(ops);
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return;
        throw err;
    }
}

// « Last seen » du profil. Le session token étant long-lived (~27 ans), le
// client ne repasse jamais par /api/auth/google : lastLogin restait figé à la
// première connexion. On horodate donc l'activité réelle depuis les points
// d'entrée authentifiés (présence, matchmaking, custom rooms, reprise de partie).
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const LAST_SEEN_CACHE_MAX = 5000;
const lastSeenWrites = new Map<string, number>();

export async function touchLastSeen(userId: string): Promise<void> {
    // Les sockets de présence se reconnectent souvent : sans garde, chaque
    // reconnexion coûterait une écriture Cosmos. Le cache est en mémoire et
    // donc par instance — réécrire est inoffensif, sauter ne coûte que de la
    // précision sur un champ affiché en temps relatif.
    const now = Date.now();
    const previous = lastSeenWrites.get(userId);
    if (previous !== undefined && now - previous < LAST_SEEN_THROTTLE_MS) return;

    // Une entrée sortie de sa fenêtre ne sert plus à rien : on purge par lot
    // plutôt qu'à chaque appel, pour que la map ne grossisse pas indéfiniment
    // avec le nombre de comptes vus depuis le démarrage du process.
    if (lastSeenWrites.size > LAST_SEEN_CACHE_MAX) {
        for (const [id, at] of lastSeenWrites) {
            if (now - at >= LAST_SEEN_THROTTLE_MS) lastSeenWrites.delete(id);
        }
    }
    lastSeenWrites.set(userId, now);

    const container = await getUsersContainer();
    // `set` crée le champ s'il est absent : les documents existants n'ont pas
    // besoin de migration.
    const ops: PatchOperation[] = [{ op: 'set', path: '/lastSeenAt', value: new Date(now).toISOString() }];
    try {
        await container.item(userId, userId).patch(ops);
    } catch (err: unknown) {
        // Échec → on retire la marque pour retenter au prochain passage plutôt
        // que d'attendre la fin de la fenêtre de throttle.
        lastSeenWrites.delete(userId);
        if ((err as { code?: number }).code === 404) return;
        throw err;
    }
}

export async function getUserPointsAndRanking(userId: string): Promise<{ points: number; ranking: number } | null> {
    const container = await getUsersContainer();
    try {
        const { resource } = await container.item(userId, userId).read<{ points: number; ranking: number }>();
        return resource ? { points: resource.points ?? 0, ranking: resource.ranking ?? 0 } : null;
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
    }
}

// ── Boutique : porte-monnaie et inventaire ───────────────────────────────────
//
// Les documents antérieurs à la boutique n'ont ni `coins` ni `ownedItems`, et
// Cosmos est strict là-dessus : `incr` et `add /ownedItems/-` échouent en 400
// sur un chemin absent, et une `condition` portant sur un champ absent est
// toujours fausse. Tout chemin d'écriture doit donc d'abord garantir les champs.
//
// On ne peut pas se reposer sur /api/auth/google pour cette initialisation : le
// session token vivant ~27 ans, un appareil peut ne jamais y repasser.

const walletReady = new Set<string>();

/**
 * Crée `coins`, `ownedItems` et `armedBoosts` s'ils manquent. Idempotent,
 * mémorisé par process. Un patch séparé par champ, chacun conditionné sur SON
 * champ : une condition unique (« l'un OU l'autre est absent ») remettrait
 * `coins` à 0 chez un joueur qui a déjà des pièces mais pas encore d'inventaire.
 */
export async function ensureWalletFields(userId: string): Promise<void> {
    if (walletReady.has(userId)) return;
    const container = await getUsersContainer();
    const seeds: Array<{ path: string; field: string; value: unknown }> = [
        { path: '/coins', field: 'coins', value: 0 },
        { path: '/ownedItems', field: 'ownedItems', value: [] },
        { path: '/armedBoosts', field: 'armedBoosts', value: [] },
    ];
    for (const { path, field, value } of seeds) {
        try {
            await container.item(userId, userId).patch({
                operations: [{ op: 'set', path, value }],
                condition: `FROM c WHERE NOT IS_DEFINED(c.${field})`,
            });
        } catch (err: unknown) {
            const code = (err as { code?: number }).code;
            // 412 = condition non remplie, donc le champ existe déjà (cas
            // nominal après le premier passage). 404 = compte supprimé.
            if (code !== 412 && code !== 404) throw err;
        }
    }
    walletReady.add(userId);
}

export interface UserWallet {
    coins: number;
    /** Objets de collection, acquis pour toujours (emojis, dos de cartes). */
    ownedItems: string[];
    /** Boosters achetés et pas encore consommés : ils valent pour la PROCHAINE
     *  partie du joueur (voir consumeArmedBoosts). Un exemplaire de chaque au plus. */
    armedBoosts: string[];
}

/** Champ d'inventaire visé par un achat. */
export type WalletInventory = 'ownedItems' | 'armedBoosts';

function toWallet(resource: Partial<UserWallet>): UserWallet {
    return {
        coins: resource.coins ?? 0,
        ownedItems: resource.ownedItems ?? [],
        armedBoosts: resource.armedBoosts ?? [],
    };
}

export async function getUserWallet(userId: string): Promise<UserWallet | null> {
    const container = await getUsersContainer();
    try {
        const { resource } = await container.item(userId, userId).read<Partial<UserWallet>>();
        if (!resource) return null;
        return toWallet(resource);
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
    }
}

/**
 * Crédite le solde et renvoie le NOUVEAU solde : le patch retourne le document
 * à jour, donc aucune lecture supplémentaire n'est nécessaire en fin de partie.
 * Renvoie null si le compte n'existe pas.
 */
export async function awardCoins(userId: string, delta: number): Promise<number | null> {
    await ensureWalletFields(userId);
    const container = await getUsersContainer();
    const ops: PatchOperation[] = [{ op: 'incr', path: '/coins', value: delta }];
    try {
        const { resource } = await container.item(userId, userId).patch<Partial<UserWallet>>(ops);
        return resource?.coins ?? null;
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
    }
}

export type PurchaseResult =
    | ({ ok: true } & UserWallet)
    | { ok: false; reason: 'not_found' | 'rejected' };

/**
 * Achat atomique : débit et ajout à l'inventaire dans un SEUL patch conditionné.
 * La condition porte à la fois sur le solde et sur la non-possession, donc le
 * solde ne peut pas devenir négatif et deux requêtes concurrentes ne peuvent pas
 * débiter deux fois (la seconde échoue en 412, sans application partielle).
 *
 * `inventory` choisit le champ : `ownedItems` pour un objet de collection,
 * `armedBoosts` pour un booster. Même règle dans les deux cas (un exemplaire au
 * plus), c'est seulement la durée de vie qui diffère : un booster quitte
 * `armedBoosts` au lancement de la partie suivante et peut alors être racheté.
 *
 * `reason: 'rejected'` couvre indifféremment « pas assez de pièces » et « déjà
 * possédé » : l'appelant relit le porte-monnaie pour distinguer les deux, hors
 * du chemin critique.
 *
 * La `condition` est une expression SQL sans paramètres nommés : `itemId` et
 * `price` doivent venir du catalogue serveur, jamais du corps de la requête.
 */
export async function purchaseItem(
    userId: string,
    itemId: string,
    price: number,
    inventory: WalletInventory = 'ownedItems',
): Promise<PurchaseResult> {
    await ensureWalletFields(userId);
    const container = await getUsersContainer();
    const cost = Math.trunc(price);
    try {
        const { resource } = await container.item(userId, userId).patch<Partial<UserWallet>>({
            operations: [
                { op: 'incr', path: '/coins', value: -cost },
                { op: 'add', path: `/${inventory}/-`, value: itemId },
            ],
            condition: `FROM c WHERE c.coins >= ${cost} AND NOT ARRAY_CONTAINS(c.${inventory}, "${itemId}")`,
        });
        if (!resource) return { ok: false, reason: 'not_found' };
        return { ok: true, ...toWallet(resource) };
    } catch (err: unknown) {
        const code = (err as { code?: number }).code;
        if (code === 404) return { ok: false, reason: 'not_found' };
        if (code === 412) return { ok: false, reason: 'rejected' };
        throw err;
    }
}

/** Tentatives de consommation avant d'abandonner face à des écritures concurrentes. */
const CONSUME_BOOSTS_ATTEMPTS = 3;

/**
 * Vide `armedBoosts` et renvoie ce qu'il contenait : ce sont les boosters de la
 * partie qui démarre. Appelé une seule fois, au lancement.
 *
 * La lecture et l'écriture sont liées par l'etag : un achat qui s'intercale
 * (autre appareil) fait échouer le patch en 412 au lieu d'être effacé sans
 * avoir été appliqué, et on relit. Les écritures de points et de classement
 * (recomputeRankings touche tous les comptes à chaque fin de partie) peuvent
 * produire le même 412, d'où quelques tentatives. Si la contention persiste,
 * on ne consomme rien : les boosters restent armés pour la partie suivante,
 * ce qui vaut mieux qu'un booster débité sans effet.
 */
export async function consumeArmedBoosts(userId: string): Promise<string[]> {
    const container = await getUsersContainer();
    const item = container.item(userId, userId);
    for (let attempt = 0; attempt < CONSUME_BOOSTS_ATTEMPTS; attempt++) {
        let resource: (Partial<UserWallet> & { _etag?: string }) | undefined;
        try {
            ({ resource } = await item.read<Partial<UserWallet> & { _etag?: string }>());
        } catch (err: unknown) {
            if ((err as { code?: number }).code === 404) return [];
            throw err;
        }
        const armed = resource?.armedBoosts ?? [];
        if (!resource?._etag || armed.length === 0) return [];
        try {
            await item.patch([{ op: 'set', path: '/armedBoosts', value: [] }], {
                accessCondition: { type: 'IfMatch', condition: resource._etag },
            });
            return armed;
        } catch (err: unknown) {
            const code = (err as { code?: number }).code;
            if (code === 404) return [];
            if (code !== 412) throw err;
        }
    }
    console.warn(`⚠️ Boosters de ${userId} non consommés : document modifié en continu`);
    return [];
}

export async function recomputeRankings(): Promise<void> {
    const container = await getUsersContainer();
    const { resources: users } = await container.items
        .query<{ id: string; points: number }>('SELECT c.id, c.points FROM c ORDER BY c.points DESC')
        .fetchAll();

    let rank = 1;
    for (let i = 0; i < users.length; i++) {
        if (i > 0 && users[i]!.points < users[i - 1]!.points) {
            rank = i + 1;
        }
        const ops: PatchOperation[] = [{ op: 'replace', path: '/ranking', value: rank }];
        await container.item(users[i]!.id, users[i]!.id).patch(ops);
    }
}

export interface AudienceStats {
    activeLast24h: number;
    signupsLast24h: number;
    totalAccounts: number;
    lastSeen: { name: string; lastSeenAt: string } | null;
    recentSignups: { name: string; createdAt: string }[];
}

/**
 * Audience des comptes Google (GET /api/admin/stats). Les invités n'ont pas de
 * document et n'y figurent donc pas. Les bots sont exclus via le flag `isBot`
 * (posé à chaque login d'agent) et via `excludedIds` : bots connus du process
 * dont le document n'a pas encore reçu le flag, compte staff.
 */
export async function getAudienceStats(excludedIds: string[]): Promise<AudienceStats> {
    const container = await getUsersContainer();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const humans = 'NOT IS_DEFINED(c.isBot) AND NOT ARRAY_CONTAINS(@excluded, c.id)';
    const excluded = { name: '@excluded', value: excludedIds };
    const sinceParam = { name: '@since', value: since };

    const run = async <T>(query: string, withSince = false): Promise<T[]> => {
        const parameters = withSince ? [excluded, sinceParam] : [excluded];
        const { resources } = await container.items.query<T>({ query, parameters }).fetchAll();
        return resources;
    };

    // Les dates sont stockées en ISO 8601 UTC (toISOString) : la comparaison
    // de chaînes suit l'ordre chronologique.
    const [active, signups, total, lastSeen, recentSignups] = await Promise.all([
        run<number>(`SELECT VALUE COUNT(1) FROM c WHERE ${humans} AND c.lastSeenAt >= @since`, true),
        run<number>(`SELECT VALUE COUNT(1) FROM c WHERE ${humans} AND c.createdAt >= @since`, true),
        run<number>(`SELECT VALUE COUNT(1) FROM c WHERE ${humans}`),
        run<{ name: string; lastSeenAt: string }>(
            `SELECT TOP 1 c.name, c.lastSeenAt FROM c WHERE ${humans} AND IS_DEFINED(c.lastSeenAt) ORDER BY c.lastSeenAt DESC`),
        run<{ name: string; createdAt: string }>(
            `SELECT TOP 5 c.name, c.createdAt FROM c WHERE ${humans} AND IS_DEFINED(c.createdAt) ORDER BY c.createdAt DESC`),
    ]);

    return {
        activeLast24h: active[0] ?? 0,
        signupsLast24h: signups[0] ?? 0,
        totalAccounts: total[0] ?? 0,
        lastSeen: lastSeen[0] ?? null,
        recentSignups,
    };
}
