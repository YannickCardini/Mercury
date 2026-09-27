import { Router, type Request, type Response } from 'express';
import { safeEqual } from '../auth/auth-router.js';
import { getAudienceStats } from '../db.js';
import { GameRegistry } from '../session/game-registry.js';
import { getKnownBotUserIds } from '../session/bot-dispatch.js';
import type { SessionManager } from '../session/session-manager.js';

/** Compte staff (revue Google Play) : exclu des stats d'audience comme les bots. */
const WORKER_USER_ID = '1337';

function formatAgo(iso: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} h ${minutes % 60} min`;
    return `${Math.floor(hours / 24)} j`;
}

/**
 * Routes d'administration. Fabrique plutôt que singleton : l'état en mémoire
 * (file de matchmaking, rooms, sockets) vit dans des objets créés par index.ts.
 */
export function createAdminRouter(sessionManager: SessionManager, wsConnectionCount: () => number): Router {
    const router = Router();

    // GET /api/admin/stats — `Authorization: Bearer <ADMIN_SECRET>`.
    router.get('/stats', async (req: Request, res: Response) => {
        const secret = process.env['ADMIN_SECRET'];
        if (!secret) {
            res.status(503).json({ error: 'Admin stats not configured' });
            return;
        }
        const authHeader = req.headers['authorization'];
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
        if (!token || !safeEqual(token, secret)) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const games = GameRegistry.all()
            .map(g => g.getAdminSummary())
            .filter(g => g.inProgress);

        // Une panne Cosmos ne doit pas masquer l'état en mémoire.
        const audience = await getAudienceStats([...getKnownBotUserIds(), WORKER_USER_ID]).then(
            stats => ({
                ...stats,
                lastSeen: stats.lastSeen && { ...stats.lastSeen, ago: formatAgo(stats.lastSeen.lastSeenAt) },
            }),
            (err: unknown) => {
                console.error('❌ Cosmos DB error (GET /admin/stats):', err);
                return null;
            },
        );

        res.json({
            generatedAt: new Date().toISOString(),
            live: {
                gamesInProgress: games.length,
                games,
                ...sessionManager.getLobbySummary(),
                wsConnections: wsConnectionCount(),
            },
            audience,
        });
    });

    return router;
}
