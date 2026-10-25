import { Router, type Request, type Response } from 'express';

/**
 * ─── Source de vérité de la dernière version publiée ─────────────────────────
 *
 * À INCRÉMENTER À CHAQUE RELEASE, en même temps que `versionCode` /
 * `versionName` dans frontend/android/app/build.gradle :
 *   - LATEST_VERSION_CODE  doit valoir le `versionCode` du nouveau build.
 *   - LATEST_VERSION_NAME  doit valoir le `versionName` du nouveau build.
 *
 * Les valeurs sont surchargeables par variables d'environnement
 * (LATEST_VERSION_CODE / LATEST_VERSION_NAME / MIN_VERSION_CODE / STORE_URL)
 * pour pouvoir annoncer une nouvelle version sans redéployer le code.
 */
const DEFAULT_LATEST_VERSION_CODE = 204;
const DEFAULT_LATEST_VERSION_NAME = '2.2.0';
const DEFAULT_STORE_URL = 'https://play.google.com/store/apps/details?id=online.mercury.game';

const router = Router();

// GET /api/version — public, sans authentification.
// Permet à l'app mobile de savoir si un build plus récent existe afin de
// proposer (ou forcer) une mise à jour.
// Variables lues à chaque requête, pas à l'import : en ESM les imports sont
// évalués AVANT le dotenv.config() d'index.ts, et des constantes de module
// ignoraient donc les valeurs du .env (même piège que train-mode.ts).
router.get('/', (_req: Request, res: Response) => {
    res.json({
        latestVersionCode: Number(process.env['LATEST_VERSION_CODE'] ?? DEFAULT_LATEST_VERSION_CODE),
        latestVersionName: process.env['LATEST_VERSION_NAME'] ?? DEFAULT_LATEST_VERSION_NAME,
        /** En dessous de ce code → mise à jour forcée (réservé pour un usage futur). */
        minVersionCode: Number(process.env['MIN_VERSION_CODE'] ?? 1),
        storeUrl: process.env['STORE_URL'] ?? DEFAULT_STORE_URL,
    });
});

export default router;
