import { Router, type Request, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { getUsersContainer } from '../db.js';

const router = Router();

const googleClient = new OAuth2Client();

/**
 * Verifies a Google id-token against the configured audiences and returns the
 * authenticated user's id (`sub`). Returns null if the token is missing or
 * invalid. Exposed for reuse by other routers (e.g. messages).
 */
export async function verifyGoogleIdToken(idToken: string | undefined): Promise<string | null> {
    if (!idToken) return null;
    if (process.env['WORKER_SESSION_TOKEN'] && idToken === process.env['WORKER_SESSION_TOKEN']) {
        return '1337';
    }
    try {
        const audiences = [process.env['GOOGLE_AUDIENCE_WEB']!, process.env['GOOGLE_AUDIENCE_ANDROID']!];
        const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
        const payload = ticket.getPayload();
        return payload?.sub ?? null;
    } catch {
        return null;
    }
}

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

// PATCH /api/auth/user/:id — update name and/or picture
router.patch('/user/:id', async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { name, picture } = req.body as { name?: string; picture?: string };

    // Validate name
    if (name !== undefined) {
        if (typeof name !== 'string' || name.length < 1 || name.length > 30) {
            res.status(400).json({ error: 'Name must be between 1 and 30 characters' });
            return;
        }
        if (!/^[\p{L}\p{N} \-_']+$/u.test(name)) {
            res.status(400).json({ error: 'Name contains invalid characters' });
            return;
        }
    }

    // Validate picture
    if (picture !== undefined) {
        if (typeof picture !== 'string') {
            res.status(400).json({ error: 'Invalid picture format' });
            return;
        }
        const dataUrlMatch = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(picture);
        if (!dataUrlMatch) {
            res.status(400).json({ error: 'Picture must be a base64 data URL (image/jpeg, image/png, or image/webp)' });
            return;
        }
        const rawBytes = dataUrlMatch ? [2].length * 3 / 4 : 0;
        if (rawBytes > 2 * 1024 * 1024) {
            res.status(400).json({ error: 'Picture exceeds 2 MB limit' });
            return;
        }
    }

    try {
        const container = await getUsersContainer();
        const { resource } = await container.item(id, id).read<UserDoc>();
        if (!resource) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (name !== undefined) resource.name = name;
        if (picture !== undefined) resource.picture = picture;

        await container.item(id, id).replace(resource);
        res.json({
            id: resource.id,
            email: resource.email,
            name: resource.name,
            picture: resource.picture,
            points: resource.points,
            ranking: resource.ranking,
            createdAt: resource.createdAt,
        });
    } catch (err) {
        console.error('❌ Cosmos DB error (PATCH /user/:id):', err);
        res.status(500).json({ error: 'Database error' });
    }
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
            lastLogin: resource.lastLogin,
        });
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /user/:id):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/auth/bot — connexion d'un bot existant en BDD
router.post('/bot', async (req: Request, res: Response) => {
    const { secret, botId } = req.body as { secret?: string; botId?: string; };

    if (!secret || secret !== process.env['BOT_SECRET']) {
        res.status(401).json({ error: 'Invalid bot secret' });
        return;
    }
    if (!botId || botId.length < 1 || botId.length > 64 || !/^[\w-]+$/.test(botId)) {
        res.status(400).json({ error: 'botId must be 1–64 alphanumeric/dash characters' });
        return;
    }

    try {
        const container = await getUsersContainer();
        let resource: UserDoc | undefined;
        try {
            const result = await container.item(botId, botId).read<UserDoc>();
            resource = result.resource;
        } catch (err: unknown) {
            if ((err as { code?: number }).code === 404) {
                res.status(404).json({ error: 'Bot not found' });
                return;
            }
            throw err;
        }
        if (!resource) {
            res.status(404).json({ error: 'Bot not found' });
            return;
        }
        resource.lastLogin = new Date().toISOString();
        await container.item(botId, botId).replace(resource);
        res.json({ userId: resource.id, name: resource.name, picture: resource.picture, points: resource.points, ranking: resource.ranking });
    } catch (err) {
        console.error('❌ Cosmos DB error (POST /bot):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/auth/worker — staff login for the dedicated Google review account (user 1337)
router.post('/worker', async (req: Request, res: Response) => {
    const { username, password } = req.body as { username?: string; password?: string };

    const validUsername = process.env['WORKER_USERNAME'];
    const validPassword = process.env['WORKER_PASSWORD'];
    const sessionToken = process.env['WORKER_SESSION_TOKEN'];

    if (!validUsername || !validPassword || !sessionToken) {
        res.status(503).json({ error: 'Worker auth not configured' });
        return;
    }

    if (!username || !password || username !== validUsername || password !== validPassword) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }

    const workerId = '1337';
    try {
        const container = await getUsersContainer();
        const { resource } = await container.item(workerId, workerId).read<UserDoc>();
        if (!resource) {
            res.status(404).json({ error: 'Worker account not found' });
            return;
        }
        resource.lastLogin = new Date().toISOString();
        await container.item(workerId, workerId).replace(resource);
        res.json({
            user: {
                id: resource.id,
                email: resource.email,
                name: resource.name,
                picture: resource.picture,
                points: resource.points,
                ranking: resource.ranking,
                createdAt: resource.createdAt,
            },
            sessionToken,
        });
    } catch (err) {
        console.error('❌ Cosmos DB error (POST /worker):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// DELETE /api/auth/user/:id — permanently delete account and all associated data
router.delete('/user/:id', async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const authHeader = req.headers['authorization'];
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const verifiedSub = await verifyGoogleIdToken(idToken);

    if (!verifiedSub || verifiedSub !== id) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    try {
        const container = await getUsersContainer();
        const { resource } = await container.item(id, id).read<UserDoc>();
        if (!resource) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        await container.item(id, id).delete();
        res.status(204).send();
    } catch (err) {
        console.error('❌ Cosmos DB error (DELETE /user/:id):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/auth/leaderboard — top 100 players sorted by ranking
router.get('/leaderboard', async (_req: Request, res: Response) => {
    try {
        const container = await getUsersContainer();
        const { resources } = await container.items
            .query<Pick<UserDoc, 'id' | 'name' | 'picture' | 'points' | 'ranking'>>(
                'SELECT TOP 100 c.id, c.name, c.picture, c.ranking, c.points FROM c ORDER BY c.points DESC'
            )
            .fetchAll();
        res.json(resources);
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /leaderboard):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
