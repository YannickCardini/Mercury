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
