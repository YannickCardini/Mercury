import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { getMessagesContainer, getUsersContainer } from '../db.js';
import { verifyAuth } from '../auth/auth-router.js';

const router = Router();

const MAX_TEXT_LENGTH = 500;

interface MessageDoc {
    id: string;
    fromUserId: string;
    fromName: string;
    fromPicture: string;
    toUserId: string;
    toName: string;
    toPicture: string;
    text: string;
    createdAt: string;
    read: boolean;
}

interface UserLite {
    id: string;
    name: string;
    picture: string;
}

interface Thread {
    peerId: string;
    peerName: string;
    peerPicture: string;
    lastMessage: { text: string; createdAt: string; fromMe: boolean };
    unreadCount: number;
}

// Header Authorization uniquement : le client l'envoie depuis l'introduction de
// la messagerie, et un token de session (~27 ans) ne doit jamais transiter dans
// une URL (journaux de proxy) ni dans un corps de requête.
function extractIdToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
}

// POST /api/messages — send a private message
router.post('/', async (req: Request, res: Response) => {
    const idToken = extractIdToken(req);
    const senderId = await verifyAuth(idToken);
    if (!senderId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const { toUserId, text } = req.body as { toUserId?: string; text?: string };
    if (!toUserId || typeof toUserId !== 'string') {
        res.status(400).json({ error: 'toUserId is required' });
        return;
    }
    if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'text is required' });
        return;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        res.status(400).json({ error: 'text cannot be empty' });
        return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
        res.status(400).json({ error: `text exceeds ${MAX_TEXT_LENGTH} characters` });
        return;
    }
    if (toUserId === senderId) {
        res.status(400).json({ error: 'Cannot send a message to yourself' });
        return;
    }

    try {
        const users = await getUsersContainer();
        const { resource: recipient } = await users.item(toUserId, toUserId).read<UserLite>();
        if (!recipient) {
            res.status(404).json({ error: 'Recipient not found' });
            return;
        }
        const { resource: sender } = await users.item(senderId, senderId).read<UserLite>();
        if (!sender) {
            res.status(404).json({ error: 'Sender not found' });
            return;
        }

        const messages = await getMessagesContainer();
        const doc: MessageDoc = {
            id: randomUUID(),
            fromUserId: senderId,
            fromName: sender.name ?? '',
            fromPicture: sender.picture ?? '',
            toUserId,
            toName: recipient.name ?? '',
            toPicture: recipient.picture ?? '',
            text: trimmed,
            createdAt: new Date().toISOString(),
            read: false,
        };
        await messages.items.create(doc);
        res.status(201).json({
            id: doc.id,
            fromUserId: doc.fromUserId,
            fromName: doc.fromName,
            fromPicture: doc.fromPicture,
            toUserId: doc.toUserId,
            toName: doc.toName,
            toPicture: doc.toPicture,
            text: doc.text,
            createdAt: doc.createdAt,
            read: doc.read,
        });
    } catch (err) {
        console.error('❌ Cosmos DB error (POST /messages):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/messages/threads — list of conversations for the authenticated user
router.get('/threads', async (req: Request, res: Response) => {
    const idToken = extractIdToken(req);
    const userId = await verifyAuth(idToken);
    if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    try {
        const messages = await getMessagesContainer();
        // Cross-partition: messages where user is recipient OR sender.
        const { resources } = await messages.items
            .query<MessageDoc>({
                query: `SELECT c.id, c.fromUserId, c.fromName, c.fromPicture, c.toUserId, c.toName, c.toPicture, c.text, c.createdAt, c.read
                        FROM c WHERE c.toUserId = @uid OR c.fromUserId = @uid`,
                parameters: [{ name: '@uid', value: userId }],
            })
            .fetchAll();

        const threadMap = new Map<string, Thread>();
        for (const m of resources) {
            const fromMe = m.fromUserId === userId;
            const peerId = fromMe ? m.toUserId : m.fromUserId;
            const peerName = fromMe ? m.toName : m.fromName;
            const peerPicture = fromMe ? m.toPicture : m.fromPicture;

            let t = threadMap.get(peerId);
            if (!t) {
                t = {
                    peerId,
                    peerName: peerName ?? '',
                    peerPicture: peerPicture ?? '',
                    lastMessage: { text: m.text, createdAt: m.createdAt, fromMe },
                    unreadCount: 0,
                };
                threadMap.set(peerId, t);
            } else {
                if (new Date(m.createdAt).getTime() > new Date(t.lastMessage.createdAt).getTime()) {
                    t.lastMessage = { text: m.text, createdAt: m.createdAt, fromMe };
                }
                if (peerName && !t.peerName) t.peerName = peerName;
                if (peerPicture && !t.peerPicture) t.peerPicture = peerPicture;
            }
            if (!fromMe && !m.read) t.unreadCount++;
        }

        const threads = [...threadMap.values()].sort(
            (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
        );
        res.json(threads);
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /messages/threads):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/messages/thread/:peerId — full conversation between user and peer
router.get('/thread/:peerId', async (req: Request, res: Response) => {
    const idToken = extractIdToken(req);
    const userId = await verifyAuth(idToken);
    if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const { peerId } = req.params as { peerId: string };
    if (!peerId) {
        res.status(400).json({ error: 'peerId is required' });
        return;
    }

    try {
        const messages = await getMessagesContainer();
        const { resources } = await messages.items
            .query<MessageDoc>({
                query: `SELECT c.id, c.fromUserId, c.fromName, c.fromPicture, c.toUserId, c.toName, c.toPicture, c.text, c.createdAt, c.read
                        FROM c
                        WHERE (c.toUserId = @uid AND c.fromUserId = @peer)
                           OR (c.toUserId = @peer AND c.fromUserId = @uid)
                        ORDER BY c.createdAt ASC`,
                parameters: [
                    { name: '@uid', value: userId },
                    { name: '@peer', value: peerId },
                ],
            })
            .fetchAll();
        res.json(resources);
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /messages/thread/:peerId):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/messages/unread-count — count of unread messages for authenticated user
router.get('/unread-count', async (req: Request, res: Response) => {
    const idToken = extractIdToken(req);
    const userId = await verifyAuth(idToken);
    if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    try {
        const messages = await getMessagesContainer();
        const { resources } = await messages.items
            .query<{ n: number }>({
                query: 'SELECT VALUE COUNT(1) FROM c WHERE c.toUserId = @uid AND c.read = false',
                parameters: [{ name: '@uid', value: userId }],
            }, { partitionKey: userId })
            .fetchAll();
        const count = (resources[0] as unknown as number) ?? 0;
        res.json({ count });
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /messages/unread-count):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/messages/mark-read — mark unread messages as read.
// Body: { peerId? } — if provided, only marks messages received from that peer.
router.post('/mark-read', async (req: Request, res: Response) => {
    const idToken = extractIdToken(req);
    const userId = await verifyAuth(idToken);
    if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const { peerId } = (req.body ?? {}) as { peerId?: string };

    try {
        const messages = await getMessagesContainer();
        const query = peerId
            ? {
                query: 'SELECT c.id FROM c WHERE c.toUserId = @uid AND c.fromUserId = @peer AND c.read = false',
                parameters: [
                    { name: '@uid', value: userId },
                    { name: '@peer', value: peerId },
                ],
            }
            : {
                query: 'SELECT c.id FROM c WHERE c.toUserId = @uid AND c.read = false',
                parameters: [{ name: '@uid', value: userId }],
            };

        const { resources: ids } = await messages.items
            .query<{ id: string }>(query, { partitionKey: userId })
            .fetchAll();

        await Promise.all(
            ids.map(({ id }) =>
                messages.item(id, userId).patch([{ op: 'replace', path: '/read', value: true }])
            )
        );
        res.json({ updated: ids.length });
    } catch (err) {
        console.error('❌ Cosmos DB error (POST /messages/mark-read):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
