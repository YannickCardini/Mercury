const BROWSER_ID_KEY = 'browser_id';

/**
 * Identifiant aléatoire de cette installation (navigateur ou app), créé au
 * premier besoin et gardé en localStorage. Le serveur s'en sert pour refuser
 * un second onglet dans la même file, et pour distinguer un nouvel invité
 * d'un invité qui revient (voir la politique de confidentialité).
 */
export function getOrCreateBrowserId(): string {
  let id = localStorage.getItem(BROWSER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_KEY, id);
  }
  return id;
}

const GAMES_STARTED_KEY = 'games_started';
const LAST_COUNTED_GAME_KEY = 'last_counted_game_id';

/**
 * Parties lancées sur cette installation. Envoyé avec `joinMatchmaking` : sous
 * 2, le serveur considère que le joueur découvre le jeu et remplit sa file vite.
 */
export function getGamesStartedOnDevice(): number {
  try {
    const n = Number(localStorage.getItem(GAMES_STARTED_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Compte une partie une seule fois : `welcome` revient à chaque reconnexion. */
export function countGameStart(gameId: string): void {
  try {
    if (localStorage.getItem(LAST_COUNTED_GAME_KEY) === gameId) return;
    localStorage.setItem(LAST_COUNTED_GAME_KEY, gameId);
    localStorage.setItem(GAMES_STARTED_KEY, String(getGamesStartedOnDevice() + 1));
  } catch { /* stockage indisponible : compteur best-effort */ }
}
