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
 * Crée `coins` et `ownedItems` s'ils manquent. Idempotent, mémorisé par process.
 * Deux patches séparés, chacun conditionné sur SON champ : une condition unique
 * (« l'un OU l'autre est absent ») remettrait `coins` à 0 chez un joueur qui a
 * déjà des pièces mais pas encore d'inventaire.
 */
export async function ensureWalletFields(userId: string): Promise<void> {
    if (walletReady.has(userId)) return;
    const container = await getUsersContainer();
    const seeds: Array<{ path: string; field: string; value: unknown }> = [
        { path: '/coins', field: 'coins', value: 0 },
        { path: '/ownedItems', field: 'ownedItems', value: [] },
        { path: '/pendingBoostId', field: 'pendingBoostId', value: null },
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
    ownedItems: string[];
    /** Id catalogue du boost armé pour la prochaine partie, ou null s'il n'y en a pas. */
    pendingBoostId: string | null;
}

export async function getUserWallet(userId: string): Promise<UserWallet | null> {
    const container = await getUsersContainer();
    try {
        const { resource } = await container.item(userId, userId).read<Partial<UserWallet>>();
        if (!resource) return null;
        return {
            coins: resource.coins ?? 0,
            ownedItems: resource.ownedItems ?? [],
            pendingBoostId: resource.pendingBoostId ?? null,
        };
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
    | { ok: true; coins: number; ownedItems: string[] }
    | { ok: false; reason: 'not_found' | 'rejected' };

/**
 * Achat atomique : débit et ajout à l'inventaire dans un SEUL patch conditionné.
 * La condition porte à la fois sur le solde et sur la non-possession, donc le
 * solde ne peut pas devenir négatif et deux requêtes concurrentes ne peuvent pas
 * débiter deux fois (la seconde échoue en 412, sans application partielle).
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
): Promise<PurchaseResult> {
    await ensureWalletFields(userId);
    const container = await getUsersContainer();
    const cost = Math.trunc(price);
    try {
        const { resource } = await container.item(userId, userId).patch<Partial<UserWallet>>({
            operations: [
                { op: 'incr', path: '/coins', value: -cost },
                { op: 'add', path: '/ownedItems/-', value: itemId },
            ],
            condition: `FROM c WHERE c.coins >= ${cost} AND NOT ARRAY_CONTAINS(c.ownedItems, "${itemId}")`,
        });
        if (!resource) return { ok: false, reason: 'not_found' };
        return { ok: true, coins: resource.coins ?? 0, ownedItems: resource.ownedItems ?? [] };
    } catch (err: unknown) {
        const code = (err as { code?: number }).code;
        if (code === 404) return { ok: false, reason: 'not_found' };
        if (code === 412) return { ok: false, reason: 'rejected' };
        throw err;
    }
}

export type PurchaseBoostResult =
    | { ok: true; coins: number; pendingBoostId: string }
    | { ok: false; reason: 'not_found' | 'rejected' };

/**
 * Achat d'un objet consommable (ex. boost double points) : débit et armement
 * dans un SEUL patch conditionné, comme `purchaseItem`. Diffère de
 * `purchaseItem` sur deux points : la cible est `pendingBoostId` (un
 * consommable ne rejoint jamais `ownedItems`) et la condition de possession
 * porte sur « rien n'est déjà armé », pas sur « jamais acheté » — un
 * consommable est rachetable dès qu'il est consommé (cf. `consumeBoost`).
 */
export async function purchaseBoost(
    userId: string,
    itemId: string,
    price: number,
): Promise<PurchaseBoostResult> {
    await ensureWalletFields(userId);
    const container = await getUsersContainer();
    const cost = Math.trunc(price);
    try {
        const { resource } = await container.item(userId, userId).patch<Partial<UserWallet>>({
            operations: [
                { op: 'incr', path: '/coins', value: -cost },
                { op: 'set', path: '/pendingBoostId', value: itemId },
            ],
            condition: `FROM c WHERE c.coins >= ${cost} AND IS_NULL(c.pendingBoostId)`,
        });
        if (!resource) return { ok: false, reason: 'not_found' };
        return { ok: true, coins: resource.coins ?? 0, pendingBoostId: resource.pendingBoostId ?? itemId };
    } catch (err: unknown) {
        const code = (err as { code?: number }).code;
        if (code === 404) return { ok: false, reason: 'not_found' };
        if (code === 412) return { ok: false, reason: 'rejected' };
        throw err;
    }
}

/** Boost actuellement armé pour la prochaine partie du joueur, ou null. */
export async function getPendingBoost(userId: string): Promise<string | null> {
    const container = await getUsersContainer();
    try {
        const { resource } = await container.item(userId, userId).read<Partial<UserWallet>>();
        return resource?.pendingBoostId ?? null;
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
    }
}

/**
 * Désarme le boost `itemId` en fin de partie, qu'elle ait été gagnée ou
 * perdue. Conditionné sur la valeur actuelle pour ne jamais effacer un boost
 * racheté entre-temps sur une autre partie/appareil. Best-effort : appelé
 * hors du chemin critique des points, un échec ne doit pas faire échouer la
 * fin de partie (l'appelant utilise `allSettled`).
 */
export async function consumeBoost(userId: string, itemId: string): Promise<void> {
    const container = await getUsersContainer();
    try {
        await container.item(userId, userId).patch({
            operations: [{ op: 'set', path: '/pendingBoostId', value: null }],
            condition: `FROM c WHERE c.pendingBoostId = "${itemId}"`,
        });
    } catch (err: unknown) {
        const code = (err as { code?: number }).code;
        if (code === 404 || code === 412) return;
        throw err;
    }
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
