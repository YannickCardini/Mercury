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
