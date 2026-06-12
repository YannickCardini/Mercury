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
const LATEST_VERSION_CODE = Number(process.env['LATEST_VERSION_CODE'] ?? 9);
const LATEST_VERSION_NAME = process.env['LATEST_VERSION_NAME'] ?? '0.9';
/** En dessous de ce code → mise à jour forcée (réservé pour un usage futur). */
const MIN_VERSION_CODE = Number(process.env['MIN_VERSION_CODE'] ?? 1);
const STORE_URL =
    process.env['STORE_URL'] ??
    'https://play.google.com/store/apps/details?id=online.mercury.game';

const router = Router();

// GET /api/version — public, sans authentification.
// Permet à l'app mobile de savoir si un build plus récent existe afin de
// proposer (ou forcer) une mise à jour.
router.get('/', (_req: Request, res: Response) => {
    res.json({
        latestVersionCode: LATEST_VERSION_CODE,
        latestVersionName: LATEST_VERSION_NAME,
        minVersionCode: MIN_VERSION_CODE,
        storeUrl: STORE_URL,
    });
});

export default router;
