import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import sharp from 'sharp';

let containerClient: ContainerClient | null = null;

/**
 * Client paresseux du container "avatars", calqué sur getUsersContainer (db.ts).
 * Le container est créé en lecture anonyme au niveau blob ('blob') pour que les
 * URLs soient chargeables directement via <img src> sans SAS.
 */
export async function getAvatarsContainer(): Promise<ContainerClient> {
    if (containerClient) return containerClient;

    const conn = process.env['AZURE_STORAGE_CONNECTION_STRING'];
    if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');

    const service = BlobServiceClient.fromConnectionString(conn);
    const client = service.getContainerClient(process.env['AVATARS_CONTAINER'] ?? 'avatars');
    await client.createIfNotExists({ access: 'blob' });
    containerClient = client;
    return client;
}

/**
 * Pipeline de traitement partagé (endpoint d'upload + script de migration) :
 * auto-orientation EXIF, recadrage carré 512×512 centré, sortie WebP.
 * sharp décode HEIC/HEIF/AVIF/TIFF/PNG/JPEG/WebP/GIF → couvre les photos iPhone.
 */
export function processToWebp(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: 512, height: 512, fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();
}

/**
 * Upload (ou écrase) l'avatar WebP d'un utilisateur. Un seul blob par user
 * (`${userId}.webp`) → pas d'orphelins à nettoyer. Retourne l'URL de base du
 * blob ; l'appelant y ajoute un `?v=` pour casser le cache (le blob est écrasé
 * en place, l'URL de base est donc stable).
 */
export async function uploadAvatarWebp(userId: string, data: Buffer): Promise<string> {
    const container = await getAvatarsContainer();
    const block = container.getBlockBlobClient(`${userId}.webp`);
    await block.uploadData(data, {
        blobHTTPHeaders: {
            blobContentType: 'image/webp',
            blobCacheControl: 'public, max-age=31536000, immutable',
        },
    });
    return block.url;
}
