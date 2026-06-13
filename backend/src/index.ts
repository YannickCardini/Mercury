import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer, type IncomingMessage } from 'http';
import { WebSocketServer } from 'ws';
import { SessionManager } from './session/session-manager.js';
import { GameRegistry } from './session/game-registry.js';
import type { ClientMessage } from '@mercury/shared';
import { MultiWsMessenger, wsSend } from './game/game-messenger.js';
import authRouter, { verifyAuth } from './auth/auth-router.js';
import messagesRouter from './messages/messages-router.js';
import versionRouter from './version/version-router.js';

const DEBUG = process.env['DEBUG'] === 'true';


// ─── Origines autorisées (CORS + WebSocket) ───────────────────────────────────
// Les requêtes sans header Origin (agent IA, curl, health checks Azure) sont
// acceptées : CORS/Origin ne protège que contre les appels initiés par un
// navigateur depuis un site tiers.
const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:8100',   // ionic serve
    'http://localhost:4200',   // ng serve
    'https://localhost',       // Capacitor Android
    'capacitor://localhost',   // Capacitor iOS
];
const allowedOrigins = process.env['ALLOWED_ORIGINS']
    ? process.env['ALLOWED_ORIGINS'].split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;

function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true;
    return allowedOrigins.includes(origin);
}

const app = express();
app.set('trust proxy', 1); // Azure App Service termine TLS derrière un proxy
app.use(cors({ origin: (origin, cb) => cb(null, isOriginAllowed(origin)) }));
app.use(express.json({ limit: '4mb' }));

// Limites globales par IP, plus strictes sur les endpoints d'authentification.
app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use(['/api/auth/google', '/api/auth/bot', '/api/auth/worker'],
    rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }));

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

// ─── Connexions WebSocket ─────────────────────────────────────────────────────

const MAX_WS_PER_IP = 20;
const wsConnectionsPerIp = new Map<string, number>();

// Heartbeat protocole : les WebView mobiles tuées sans close frame laissent des
// sockets zombies que le serveur croit connectées (le joueur semble "en ligne"
// et la fenêtre de reconnexion ne démarre jamais). Le navigateur répond
// automatiquement aux pings ; sans pong avant le tick suivant, on termine.
const HEARTBEAT_INTERVAL_MS = 30_000;
const socketAlive = new WeakMap<object, boolean>();

setInterval(() => {
    for (const client of wss.clients) {
        if (socketAlive.get(client) === false) {
            client.terminate();
            continue;
        }
        socketAlive.set(client, false);
        client.ping();
    }
}, HEARTBEAT_INTERVAL_MS).unref();

function clientIp(req: IncomingMessage): string {
    const fwd = req.headers['x-forwarded-for'];
    const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
    return first?.trim() || req.socket.remoteAddress || 'unknown';
}

/** Types de premier message qui établissent une session sur cette socket. */
const SETUP_MESSAGE_TYPES: ReadonlySet<string> = new Set([
    'start', 'createRoom', 'joinRoom', 'joinMatchmaking',
    'createCustomRoom', 'joinCustomRoom', 'registerPresence', 'joinGame',
]);

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin)) {
        console.warn(`🚫 Connexion WS refusée — origin non autorisée: ${origin}`);
        ws.close(1008, 'Origin not allowed');
        return;
    }

    socketAlive.set(ws, true);
    (ws as unknown as import('ws').WebSocket).on('pong', () => socketAlive.set(ws, true));

    const ip = clientIp(req);
    const ipCount = (wsConnectionsPerIp.get(ip) ?? 0) + 1;
    if (ipCount > MAX_WS_PER_IP) {
        console.warn(`🚫 Connexion WS refusée — trop de connexions pour ${ip}`);
        ws.close(1008, 'Too many connections');
        return;
    }
    wsConnectionsPerIp.set(ip, ipCount);
    ws.addEventListener('close', () => {
        const c = (wsConnectionsPerIp.get(ip) ?? 1) - 1;
        if (c <= 0) wsConnectionsPerIp.delete(ip);
        else wsConnectionsPerIp.set(ip, c);
    }, { once: true });

    console.log('✅ Client connecté');

    // Le premier message valide configure la session (matchmaking, room, presence,
    // reconnexion…). Le listener reste actif tant qu'aucun message de setup
    // reconnu n'est arrivé : un JSON malformé ou un type inattendu ne condamne
    // plus la socket en silence. Après ça, Game/managers gèrent leurs listeners.
    const setupListener = (raw: MessageEvent) => {
        let msg: ClientMessage;
        try {
            msg = JSON.parse(raw.data as string) as ClientMessage;
        } catch (e) {
            console.error('❌ Message WS malformé:', e);
            return;
        }
        if (!SETUP_MESSAGE_TYPES.has(msg.type)) {
            console.warn(`⚠️ Message inattendu avant l'établissement de session: ${msg.type}`);
            return;
        }
        // Retrait synchrone : un éventuel 2e message pendant l'await de
        // handleSetupMessage ne doit pas re-déclencher le setup.
        ws.removeEventListener('message', setupListener);
        void handleSetupMessage(ws, msg);
    };
    ws.addEventListener('message', setupListener);
});

async function handleSetupMessage(ws: WebSocket, msg: ClientMessage): Promise<void> {
    try {
        switch (msg.type) {
            // Modes de test single-device : jamais exposés en production.
            case 'start':
            case 'createRoom':
            case 'joinRoom': {
                if (!DEBUG) {
                    wsSend(ws, { type: 'actionRejected', reason: 'Session expired or not found' });
                    return;
                }
                if (msg.type === 'start') sessionManager.startSingleDevice(ws, msg.config);
                else if (msg.type === 'createRoom') sessionManager.createRoom(ws, msg.config);
                else sessionManager.joinRoom(ws, msg.roomCode, msg.playerColor);
                break;
            }

            case 'joinMatchmaking': {
                // L'identité signed-in vient exclusivement du token vérifié :
                // un userId forgé par le client n'est jamais pris en compte.
                const userId = (await verifyAuth(msg.authToken)) ?? undefined;
                if (DEBUG && msg.debug === true) {
                    sessionManager.startDebugGameVsBots(ws, msg.playerName, userId, msg.picture);
                } else {
                    sessionManager.joinMatchmaking(ws, msg.playerName, msg.browserId, msg.picture, userId);
                }
                break;
            }

            case 'createCustomRoom': {
                const userId = (await verifyAuth(msg.authToken)) ?? undefined;
                sessionManager.createCustomRoom(ws, {
                    playerName: msg.playerName,
                    ...(msg.browserId ? { browserId: msg.browserId } : {}),
                    ...(msg.picture ? { picture: msg.picture } : {}),
                    ...(userId ? { userId } : {}),
                });
                break;
            }

            case 'joinCustomRoom': {
                const userId = (await verifyAuth(msg.authToken)) ?? undefined;
                sessionManager.joinCustomRoom(ws, msg.code, {
                    playerName: msg.playerName,
                    ...(msg.browserId ? { browserId: msg.browserId } : {}),
                    ...(msg.picture ? { picture: msg.picture } : {}),
                    ...(userId ? { userId } : {}),
                });
                break;
            }

            case 'registerPresence': {
                const userId = await verifyAuth(msg.authToken);
                if (!userId) return; // présence réservée aux comptes authentifiés
                sessionManager.registerPresence(ws, userId);
                break;
            }

            case 'joinGame': {
                const identity = sessionManager.reconnect.getByGuest(msg.guestPlayerId);
                if (!identity) {
                    wsSend(ws, { type: 'actionRejected', reason: 'Session expired or not found' });
                    break;
                }
                const game = GameRegistry.get(identity.gameId);
                if (!game) {
                    wsSend(ws, { type: 'actionRejected', reason: 'Session expired or not found' });
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
                        wsSend(ws, { type: 'actionRejected', reason: 'Session expired or not found' });
                    }
                } else {
                    wsSend(ws, { type: 'actionRejected', reason: 'Session expired or not found' });
                }
                break;
            }
        }
    } catch (e) {
        console.error('❌ Erreur pendant l\'établissement de session WS:', e);
        try {
            wsSend(ws, { type: 'actionRejected', reason: 'Internal error' });
        } catch { /* socket déjà fermée */ }
    }
}

server.listen(PORT, () => {
    console.log(`🚀 Serveur hybride (HTTP + WS) prêt sur le port ${PORT}`);
    console.log(`🔐 Origines autorisées: ${allowedOrigins.join(', ')}${DEBUG ? ' (DEBUG actif)' : ''}`);
});
