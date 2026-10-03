
// ─────────────────────────────────────────────────────────────────────────────
// Dispatch des agents IA externes — partagé entre le matchmaking (remplir la
// file d'attente) et game-restore (re-seater les bots d'une partie restaurée).
//
// Le dispatch est un simple "réveil" : l'agent s'authentifie ensuite lui-même
// (POST /api/auth/bot) et rejoint via le chemin joinMatchmaking public, comme
// un humain. Le backend ne sait rien des modèles utilisés côté agent.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UserIds des agents IA, enregistrés au fil de leurs connexions réussies à
 * POST /api/auth/bot. Les botIds du pool sont arbitraires (documents Users
 * pré-créés en base : '2', '5', '27'…) — aucune liste statique ne peut les
 * couvrir. Pré-seedé avec les ids historiques par prudence.
 */
const knownBotUserIds = new Set<string>(['1', '2', '3', '4']);

/** Appelé par POST /api/auth/bot à chaque connexion réussie d'un agent. */
export function registerBotUserId(userId: string): void {
    knownBotUserIds.add(userId);
}

/** Vrai si ce compte s'est authentifié comme bot (ou id bot historique). */
export function isBotUserId(userId: string | undefined): boolean {
    return userId !== undefined && knownBotUserIds.has(userId);
}

/** Bots connus de ce process (exclusion des stats d'audience). */
export function getKnownBotUserIds(): string[] {
    return [...knownBotUserIds];
}

/**
 * Étiquette de log d'un joueur : `bot:<id>`, `user:<id>` ou `guest:<browserId>`.
 * Rend les lignes de matchmaking/room agrégeables (humains distincts, invités).
 */
export function accountTag(userId: string | undefined, browserId?: string): string {
    if (userId) return `${isBotUserId(userId) ? 'bot' : 'user'}:${userId}`;
    return `guest:${browserId ?? '?'}`;
}

/**
 * Réveille un agent IA via POST ${AGENT_URL}/dispatch.
 * `busy` = 503, tous les bots du pool sont déjà actifs (réessayable).
 */
export async function dispatchBotAgent(): Promise<'ok' | 'busy' | 'failed'> {
    const url = process.env['AGENT_URL'];
    const secret = process.env['BOT_SECRET'];
    if (!url || !secret) {
        console.warn('🤖 AGENT_URL or BOT_SECRET non configuré — dispatch ignoré');
        return 'failed';
    }
    try {
        // `gameMode` est toujours '2v2' : l'agent externe peut choisir son
        // modèle d'après cette valeur, ne pas la retirer sans l'accord du projet agent.
        const res = await fetch(`${url.replace(/\/$/, '')}/dispatch`, {
            method: 'POST',
            headers: { 'X-Bot-Secret': secret, 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameMode: '2v2' }),
        });
        if (res.ok) {
            console.log('🤖 Bot agent dispatched');
            return 'ok';
        }
        if (res.status === 503) {
            console.log('🤖 Agent service occupé (tous les bots sont actifs)');
            return 'busy';
        }
        console.warn(`🤖 Dispatch agent a retourné ${res.status}`);
        return 'failed';
    } catch (err) {
        console.warn('🤖 Dispatch agent a échoué:', err);
        return 'failed';
    }
}
