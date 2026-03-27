import { Router, type Request, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { getUsersContainer } from '../db.js';

const router = Router();

const googleClient = new OAuth2Client();

interface UserDoc {
    id: string;
    email: string;
    name: string;
    picture: string;
    points: number;
    ranking: number;
    lastLogin: string;
    createdAt: string;
}

// POST /api/auth/google
router.post('/google', async (req: Request, res: Response) => {
    const { idToken } = req.body as { idToken?: string };

    if (!idToken) {
        res.status(400).json({ error: 'idToken is required' });
        return;
    }

    // ── 1. Valider le token Google ──────────────────────────────────────────
    let payload;
    try {
        const audiences = [process.env['GOOGLE_AUDIENCE_WEB']!, process.env['GOOGLE_AUDIENCE_ANDROID']!];
        const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
        payload = ticket.getPayload();
    } catch {
        res.status(401).json({ error: 'Invalid Google token' });
        return;
    }

    if (!payload?.sub) {
        res.status(401).json({ error: 'Invalid token payload' });
        return;
    }

    // ── 2. Upsert utilisateur dans Cosmos DB ────────────────────────────────
    const userId = payload.sub;
    const now = new Date().toISOString();

    let user: UserDoc;

    try {
        const container = await getUsersContainer();

        try {
            const { resource } = await container.item(userId, userId).read<UserDoc>();
            if (!resource) throw Object.assign(new Error('Not found'), { code: 404 });

            // Utilisateur existant → mise à jour lastLogin
            resource.lastLogin = now;
            await container.item(userId, userId).replace(resource);
            user = resource;
        } catch (err: unknown) {
            const code = (err as { code?: number }).code;
            if (code !== 404) throw err;

            // Nouvel utilisateur → création
            user = {
                id: userId,
                email: payload.email ?? '',
                name: payload.name ?? '',
                picture: payload.picture ?? '',
                points: 0,
                ranking: 0,
                lastLogin: now,
                createdAt: now,
            };
            await container.items.create(user);
        }
    } catch (err) {
        console.error('❌ Cosmos DB error:', err);
        res.status(500).json({ error: 'Database error' });
        return;
    }

    // ── 3. Retourner les infos publiques de l'utilisateur ───────────────────
    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        points: user.points,
        ranking: user.ranking,
        createdAt: user.createdAt,
    });
});

// GET /api/auth/user/:id — public profile for a given user
router.get('/user/:id', async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    try {
        const container = await getUsersContainer();
        const { resource } = await container.item(id, id).read<UserDoc>();
        if (!resource) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            name: resource.name,
            picture: resource.picture,
            points: resource.points,
            ranking: resource.ranking,
            createdAt: resource.createdAt,
        });
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /user/:id):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/auth/leaderboard — top 100 players sorted by ranking
router.get('/leaderboard', async (_req: Request, res: Response) => {
    try {
        const container = await getUsersContainer();
        const { resources } = await container.items
            .query<Pick<UserDoc, 'name' | 'picture' | 'points' | 'ranking'>>(
                'SELECT TOP 100 c.name, c.picture, c.points, c.ranking FROM c ORDER BY c.points DESC'
            )
            .fetchAll();
        res.json(resources);
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /leaderboard):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
