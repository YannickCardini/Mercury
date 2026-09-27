// ─────────────────────────────────────────────────────────────────────────────
// Alertes admin via un bot Telegram (nouvel inscrit, humain en matchmaking…)
//
// Sans TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID, ne fait rien : le dev local et
// les environnements de test restent silencieux sans configuration dédiée.
// ─────────────────────────────────────────────────────────────────────────────

const SEND_TIMEOUT_MS = 5_000;

/** Plafond glissant sur 1 min : un client qui boucle sur joinMatchmaking ne
 *  doit ni inonder le chat, ni faire rejeter nos envois (429) par Telegram. */
const MAX_SENDS_PER_MINUTE = 20;
const recentSends: number[] = [];

/**
 * Envoie `text` (texte brut, sans parse_mode : les noms de joueurs sont saisis
 * librement et ne doivent pas être interprétés comme du Markdown/HTML).
 * Fire-and-forget : une panne Telegram n'affecte jamais le flux de jeu.
 */
export function notifyAdmin(text: string): void {
    const token = process.env['TELEGRAM_BOT_TOKEN'];
    const chatId = process.env['TELEGRAM_CHAT_ID'];
    if (!token || !chatId) return;

    const now = Date.now();
    while (recentSends.length > 0 && now - recentSends[0]! >= 60_000) recentSends.shift();
    if (recentSends.length >= MAX_SENDS_PER_MINUTE) return;
    recentSends.push(now);

    void fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
        .then(res => {
            if (!res.ok) console.warn(`📨 Alerte Telegram refusée (HTTP ${res.status})`);
        })
        // Message seul : l'objet d'erreur pourrait embarquer l'URL, donc le token.
        .catch((err: unknown) => console.warn(`📨 Alerte Telegram échouée: ${(err as Error).message}`));
}
