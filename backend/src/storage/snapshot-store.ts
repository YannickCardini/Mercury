import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import type { GameSnapshot } from '../game/game-snapshot.js';

// ─────────────────────────────────────────────────────────────────────────────
// SnapshotStore — persistance des GameSnapshot dans Azure Blob Storage
//
// Un blob par partie ("games/<gameId>.json"), écrasé à chaque fin de tour et
// supprimé à la fin de la partie. Les opérations d'un même gameId sont
// sérialisées via une chaîne de promesses : deux uploads fire-and-forget qui
// se chevauchent pourraient sinon aboutir dans le désordre (un état périmé
// écrase le plus récent), et un upload en vol pourrait atterrir APRÈS le
// delete de fin de partie et ressusciter un snapshot mort.
// ─────────────────────────────────────────────────────────────────────────────

let containerClient: ContainerClient | null = null;

/** Faux en dev local sans storage : les sites de lancement ne câblent alors
 *  pas la persistance, plutôt que de loguer une erreur à chaque tour. */
export function isSnapshotStorageConfigured(): boolean {
    return !!process.env['AZURE_STORAGE_CONNECTION_STRING'];
}

/**
 * Client paresseux du container de snapshots, calqué sur getAvatarsContainer
 * (blob.ts). Contrairement aux avatars, PAS d'accès anonyme : le contenu
 * (mains des joueurs, ordre de la pioche) ne doit jamais être lisible
 * publiquement.
 */
async function getSnapshotsContainer(): Promise<ContainerClient> {
    if (containerClient) return containerClient;

    const conn = process.env['AZURE_STORAGE_CONNECTION_STRING'];
    if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');

    const service = BlobServiceClient.fromConnectionString(conn);
    const client = service.getContainerClient(process.env['SNAPSHOTS_CONTAINER'] ?? 'game-snapshots');
    await client.createIfNotExists();
    containerClient = client;
    return client;
}

const blobName = (gameId: string) => `games/${gameId}.json`;

/** Chaîne d'opérations en cours par partie (sérialisation des écritures). */
const writeChains = new Map<string, Promise<void>>();

function enqueue(gameId: string, op: () => Promise<void>): Promise<void> {
    const chain = (writeChains.get(gameId) ?? Promise.resolve())
        .then(op)
        .catch(err => console.error(`❌ Snapshot — opération blob échouée pour ${gameId}:`, err));
    writeChains.set(gameId, chain);
    return chain;
}

/** Écrit (ou écrase) le snapshot d'une partie. Fire-and-forget : une erreur
 *  de stockage est loguée mais n'affecte jamais la partie en cours. */
export function queueSaveSnapshot(snap: GameSnapshot): void {
    enqueue(snap.gameId, async () => {
        const container = await getSnapshotsContainer();
        const data = Buffer.from(JSON.stringify(snap));
        await container.getBlockBlobClient(blobName(snap.gameId)).uploadData(data, {
            blobHTTPHeaders: { blobContentType: 'application/json' },
        });
    });
}

/** Supprime le snapshot d'une partie terminée/annulée. Idempotent. */
export function queueDeleteSnapshot(gameId: string): void {
    const chain = enqueue(gameId, async () => {
        const container = await getSnapshotsContainer();
        await container.getBlockBlobClient(blobName(gameId)).deleteIfExists();
    });
    // Après le delete, purger la chaîne si aucune écriture ne l'a réutilisée
    // entre-temps — sinon la map grossit d'une entrée par partie jouée.
    void chain.finally(() => {
        if (writeChains.get(gameId) === chain) writeChains.delete(gameId);
    });
}

/**
 * Liste et parse tous les snapshots persistés (réhydratation au boot).
 * Un blob illisible/corrompu est supprimé et ignoré : il ne doit pas empêcher
 * la restauration des autres parties.
 */
export async function listSnapshots(): Promise<GameSnapshot[]> {
    const container = await getSnapshotsContainer();
    const snapshots: GameSnapshot[] = [];
    for await (const blob of container.listBlobsFlat({ prefix: 'games/' })) {
        try {
            const buf = await container.getBlockBlobClient(blob.name).downloadToBuffer();
            snapshots.push(JSON.parse(buf.toString('utf-8')) as GameSnapshot);
        } catch (err) {
            console.warn(`⚠️ Snapshot illisible (${blob.name}) — supprimé:`, err);
            await container.getBlockBlobClient(blob.name).deleteIfExists().catch(() => { /* déjà logué */ });
        }
    }
    return snapshots;
}

/** Attend la fin de toutes les écritures en vol (flush SIGTERM). */
export async function whenWritesIdle(): Promise<void> {
    await Promise.allSettled([...writeChains.values()]);
}
