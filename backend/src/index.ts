import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { SessionManager } from './session/session-manager.js';
import { GameRegistry } from './session/game-registry.js';
import type { ClientMessage } from '@mercury/shared';
import { MultiWsMessenger } from './game/game-messenger.js';
import authRouter, { verifyAuth } from './auth/auth-router.js';
import messagesRouter from './messages/messages-router.js';
import versionRouter from './version/version-router.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use('/api/auth', authRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/version', versionRouter);

const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

app.get('/', (_req: Request, res: Response) => {
    res.send({ message: 'Mercury API est en ligne avec WebSockets !' });
});


// ─── SessionManager partagé entre toutes les connexions WS ───────────────────
// Nécessaire pour que joinRoom() retrouve la room créée par une autre connexion.

const sessionManager = new SessionManager();

// GET /api/active-game — server-authoritative reconnection lookup for signed-in
// users. Lets a client whose localStorage was wiped (e.g. WebView data loss
// after a hard shutdown) recover its guestPlayerId from its account and reuse
// the existing `joinGame` WS reconnect path. Returns null when not in a game.
app.get('/api/active-game', async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const userId = await verifyAuth(token);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const active = sessionManager.reconnect.getActiveGameForUser(userId);
    if (!active || !GameRegistry.get(active.gameId)) {
        res.json(null);
        return;
    }
    res.json({ gameId: active.gameId, guestPlayerId: active.guestPlayerId, color: active.color });
});

wss.on('connection', (ws: WebSocket) => {
    console.log('✅ Client connecté');

    // Le premier message configure la session (start / createRoom / joinRoom).
    // Après ça, le Game prend le relais via son propre handler.
    ws.addEventListener('message', (raw: MessageEvent) => {
        try {
            const msg = JSON.parse(raw.data as string) as ClientMessage;

            switch (msg.type) {
                case 'start':
                    sessionManager.startSingleDevice(ws, msg.config);
                    break;

                case 'createRoom':
                    sessionManager.createRoom(ws, msg.config);
                    break;

                case 'joinRoom':
                    sessionManager.joinRoom(ws, msg.roomCode, msg.playerColor);
                    break;

                case 'joinMatchmaking':
                    if (process.env['DEBUG'] === 'true' && msg.debug === true) {
                        sessionManager.startDebugGameVsBots(ws, msg.playerName, msg.userId, msg.picture);
                    } else {
                        sessionManager.joinMatchmaking(ws, msg.playerName, msg.browserId, msg.picture, msg.userId);
                    }
                    break;

                case 'createCustomRoom':
                    sessionManager.createCustomRoom(ws, {
                        playerName: msg.playerName,
                        ...(msg.browserId ? { browserId: msg.browserId } : {}),
                        ...(msg.picture ? { picture: msg.picture } : {}),
                        ...(msg.userId ? { userId: msg.userId } : {}),
                    });
                    break;

                case 'joinCustomRoom':
                    sessionManager.joinCustomRoom(ws, msg.code, {
                        playerName: msg.playerName,
                        ...(msg.browserId ? { browserId: msg.browserId } : {}),
                        ...(msg.picture ? { picture: msg.picture } : {}),
                        ...(msg.userId ? { userId: msg.userId } : {}),
                    });
                    break;

                case 'registerPresence':
                    sessionManager.registerPresence(ws, msg.userId);
                    break;

                case 'joinGame': {
                    const identity = sessionManager.reconnect.getByGuest(msg.guestPlayerId);
                    if (!identity) {
                        ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Session expired or not found' }));
                        break;
                    }
                    const game = GameRegistry.get(identity.gameId);
                    if (!game) {
                        ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Session expired or not found' }));
                        break;
                    }
                    const messenger = game.getMessenger();
                    if (messenger instanceof MultiWsMessenger) {
                        // Signed-in players may rejoin even after the 180s window
                        // expired — the server-side registry vouches for them.
                        const ok = messenger.reconnect(identity.color, ws, !!identity.userId);
                        if (ok) {
                            game.resendStateToPlayer(identity.color);
                            console.log(`🔄 Reconnection réussie pour ${identity.color} (game ${identity.gameId})`);
                        } else {
                            ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Session expired or not found' }));
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Session expired or not found' }));
                    }
                    break;
                }

                default:
                    // playAction / animationDone avant la création d'une partie → ignoré
                    console.warn(`⚠️ Message inattendu avant 'start': ${(msg as ClientMessage).type}`);
            }
        } catch (e) {
            console.error('❌ Message WS malformé:', e);
        }
    }, { once: true }); // Une seule fois : après ça, Game gère ses propres listeners
});

server.listen(PORT, () => {
    console.log(`🚀 Serveur hybride (HTTP + WS) prêt sur le port ${PORT}`);
});
