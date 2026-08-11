/**
 * Fiche Play Store de l'app Android — source unique côté frontend.
 *
 * Le backend peut surcharger cette valeur pour le popup de mise à jour
 * (`GET /api/version` → `storeUrl`, cf. `backend/src/version/version-router.ts`) ;
 * elle sert ici de valeur par défaut et de lien pour toute la promo web.
 */
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=online.mercury.game";
