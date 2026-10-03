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
