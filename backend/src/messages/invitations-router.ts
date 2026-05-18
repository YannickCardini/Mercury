import { Router, type Request, type Response } from 'express';
import { getInvitationsContainer } from '../db.js';
import { verifyAuth } from '../auth/auth-router.js';

const router = Router();

export interface InvitationDoc {
    id: string;
    fromUserId: string;
    fromUserName: string;
    fromUserPicture?: string;
    toUserId: string;
    roomCode: string;
    createdAt: string;
    expiresAt: string;
    ttl: number;
}

function extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
    return (req.query['idToken'] as string | undefined) ?? undefined;
}

// GET /api/invitations/pending — invitations still alive for the authenticated user
router.get('/pending', async (req: Request, res: Response) => {
    const userId = await verifyAuth(extractToken(req));
    if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    try {
        const container = await getInvitationsContainer();
        const nowIso = new Date().toISOString();
        const { resources } = await container.items
            .query<InvitationDoc>({
                query: `SELECT c.id, c.fromUserId, c.fromUserName, c.fromUserPicture, c.toUserId, c.roomCode, c.createdAt, c.expiresAt
                        FROM c WHERE c.toUserId = @uid AND c.expiresAt > @now`,
                parameters: [
                    { name: '@uid', value: userId },
                    { name: '@now', value: nowIso },
                ],
            }, { partitionKey: userId })
            .fetchAll();
        res.json(resources);
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /invitations/pending):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
