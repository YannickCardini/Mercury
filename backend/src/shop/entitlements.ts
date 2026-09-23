// ─────────────────────────────────────────────────────────────────────────────
// backend/src/shop/entitlements.ts
//
// Cache des inventaires (objets possédés) partagé par tout le process.
//
// Une réaction emoji est un message chaud : le contrôle de possession dans
// Game.handleReaction ne peut pas déclencher une lecture Cosmos. Le cache est
// préchauffé au démarrage d'une partie, invalidé immédiatement sur l'instance
// qui encaisse un achat, et expire au bout d'un TTL pour rattraper un achat
// effectué sur une autre instance. Un décalage ne peut que sous-autoriser une
// réaction, jamais en accorder une à tort.
// ─────────────────────────────────────────────────────────────────────────────

import { getUserWallet } from '../db.js';

const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { items: Set<string>; at: number }>();

/** Lecture synchrone. undefined = inconnu ou expiré, il faut passer par loadOwnedItems. */
export function peekOwnedItems(userId: string): Set<string> | undefined {
    const hit = cache.get(userId);
    if (!hit) return undefined;
    if (Date.now() - hit.at > TTL_MS) {
        cache.delete(userId);
        return undefined;
    }
    return hit.items;
}

export async function loadOwnedItems(userId: string): Promise<Set<string>> {
    const cached = peekOwnedItems(userId);
    if (cached) return cached;
    const wallet = await getUserWallet(userId);
    const items = new Set(wallet?.ownedItems ?? []);
    cache.set(userId, { items, at: Date.now() });
    return items;
}

/** À appeler après tout achat, pour que la partie en cours en tienne compte. */
export function invalidateOwnedItems(userId: string): void {
    cache.delete(userId);
}

/** Préchauffe le cache pour les sièges humains authentifiés d'une partie. */
export function prefetchOwnedItems(userIds: readonly string[]): void {
    for (const userId of userIds) {
        if (peekOwnedItems(userId)) continue;
        void loadOwnedItems(userId).catch(err =>
            console.error(`❌ Failed to prefetch owned items for ${userId}:`, err),
        );
    }
}
