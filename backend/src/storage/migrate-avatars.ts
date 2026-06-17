// Migration one-shot : convertit les avatars stockés en base64 dans CosmosDB
// vers Azure Blob Storage (WebP). Idempotent — relançable sans risque.
//
//   npm run migrate:avatars            # migre réellement
//   npm run migrate:avatars -- --dry-run   # n'écrit rien, log seulement
//
// À lancer depuis une machine ayant les connection strings de PROD dans .env
// (COSMOS_CONNECTION_STRING + AZURE_STORAGE_CONNECTION_STRING). Couvre tous les
// UserDoc, y compris les comptes bots (1-27) et worker (1337).
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import { getUsersContainer } from '../db.js';
import { processToWebp, uploadAvatarWebp } from './blob.js';

interface UserPic {
    id: string;
    picture?: string;
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
    const container = await getUsersContainer();
    const { resources: users } = await container.items
        .query<UserPic>('SELECT c.id, c.picture FROM c')
        .fetchAll();

    let migrated = 0;
    let skippedUrl = 0;
    let skippedEmpty = 0;
    let failed = 0;

    console.log(`${DRY_RUN ? '[DRY-RUN] ' : ''}${users.length} utilisateurs à examiner.`);

    for (const user of users) {
        const picture = user.picture;
        if (!picture) {
            skippedEmpty++;
            continue;
        }
        if (picture.startsWith('http')) {
            skippedUrl++; // URLs Google ou déjà migrées
            continue;
        }
        if (!picture.startsWith('data:')) {
            console.warn(`⚠️  ${user.id} : format picture inattendu, ignoré.`);
            skippedEmpty++;
            continue;
        }

        try {
            const commaIdx = picture.indexOf(',');
            const base64 = commaIdx >= 0 ? picture.slice(commaIdx + 1) : '';
            const buffer = Buffer.from(base64, 'base64');
            const webp = await processToWebp(buffer);

            if (DRY_RUN) {
                console.log(`[DRY-RUN] migrerait ${user.id} (${buffer.length} → ${webp.length} octets)`);
                migrated++;
                continue;
            }

            const baseUrl = await uploadAvatarWebp(user.id, webp);
            const pictureUrl = `${baseUrl}?v=${Date.now()}`;

            // Relire le doc complet pour ne pas écraser les autres champs.
            const { resource } = await container.item(user.id, user.id).read<Record<string, unknown>>();
            if (!resource) {
                console.warn(`⚠️  ${user.id} : introuvable au moment du replace, ignoré.`);
                failed++;
                continue;
            }
            resource['picture'] = pictureUrl;
            await container.item(user.id, user.id).replace(resource);
            console.log(`✅ ${user.id} migré → ${pictureUrl}`);
            migrated++;
        } catch (err) {
            console.error(`❌ ${user.id} : échec migration`, err);
            failed++;
        }
    }

    console.log('───────────────────────────────────');
    console.log(`${DRY_RUN ? '[DRY-RUN] ' : ''}Migrés: ${migrated} | skip URL: ${skippedUrl} | skip vide: ${skippedEmpty} | échecs: ${failed}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Erreur fatale migration:', err);
        process.exit(1);
    });
