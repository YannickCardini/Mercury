// ─────────────────────────────────────────────────────────────────────────────
// Suivi des invités — nouveau joueur, ou joueur qui enchaîne les parties ?
//
// Un invité est reconnu par le `browser_id` de son installation. Une partie
// est comptée à son lancement ; la file d'attente et l'inscription ne font que
// lire la fiche. Tout ici est best-effort : une panne Cosmos ne retarde ni ne
// casse jamais une file d'attente, un lancement de partie ou une inscription.
// ─────────────────────────────────────────────────────────────────────────────

import { getGuestHistory, recordGuestGameStart, type GuestHistory } from '../db.js';
import type { MarbleColor } from '@mercury/shared';

/**
 * Le client tire son browser_id avec crypto.randomUUID(). La valeur sert d'id
 * de document Cosmos : tout autre format (client falsifié, agent IA qui
 * rejoint sans token ni browser_id) est ignoré.
 */
const BROWSER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isBrowserId(value: unknown): value is string {
    return typeof value === 'string' && BROWSER_ID_PATTERN.test(value);
}

/** « déjà 3 parties depuis le 2026-09-12 », `as` précisant en quelle qualité. */
function pastGames(history: GuestHistory, as = ''): string {
    const plural = history.gamesStarted > 1 ? 's' : '';
    const since = history.firstSeenAt ? ` depuis le ${history.firstSeenAt.slice(0, 10)}` : '';
    return `déjà ${history.gamesStarted} partie${plural}${as}${since}`;
}

/** Un invité qui s'apprête à jouer, d'après son historique d'avant cette partie. */
export function describeGuest(history: GuestHistory): string {
    return history.gamesStarted > 0 ? `invité récurrent, ${pastGames(history)}` : 'invité, 1re partie';
}

/** Le passé d'invité d'un compte qui vient d'être créé. */
export function describeSignupHistory(history: GuestHistory): string {
    return history.gamesStarted > 0
        ? pastGames(history, ' en invité')
        : 'aucune partie en invité sur cet appareil';
}

/**
 * Historique d'une installation, ou null s'il est inconnaissable : id absent
 * ou invalide, Cosmos en panne. Ne lève jamais.
 */
export async function lookupGuestHistory(browserId: unknown): Promise<GuestHistory | null> {
    if (!isBrowserId(browserId)) return null;
    try {
        return await getGuestHistory(browserId);
    } catch (err) {
        console.error(`⚠️ Historique invité indisponible pour guest:${browserId}:`, err);
        return null;
    }
}

/** Ce que les sites de lancement savent d'un siège. */
interface LaunchedSeat {
    color: MarbleColor;
    name: string;
    userId?: string;
    browserId?: string;
}

/**
 * À appeler une fois par partie lancée : compte la partie sur la fiche de
 * chaque siège invité et trace d'où il vient. Les comptes (et les agents IA)
 * ont un userId et sont ignorés. Fire-and-forget.
 */
export function trackGuestGameStarts(gameId: string, seats: readonly LaunchedSeat[]): void {
    for (const seat of seats) {
        const { browserId } = seat;
        if (seat.userId || !isBrowserId(browserId)) continue;
        recordGuestGameStart(browserId).then(
            history => console.log(`👤 Partie ${gameId} — ${seat.name} (${seat.color}) [guest:${browserId}] : ${describeGuest(history)}`),
            (err: unknown) => console.error(`⚠️ Suivi invité indisponible pour guest:${browserId}:`, err),
        );
    }
}
