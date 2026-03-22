import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { SessionManager } from './session/session-manager.js';
import { GameRegistry } from './session/game-registry.js';
import type { ClientMessage } from '@keezen/shared';
import { MultiWsMessenger } from './game/game-messenger.js';

const app = express();
app.use(cors());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

app.get('/', (_req: Request, res: Response) => {
    res.send({ message: 'Keezen API est en ligne avec WebSockets !' });
});

// ─── SessionManager partagé entre toutes les connexions WS ───────────────────
// Nécessaire pour que joinRoom() retrouve la room créée par une autre connexion.

const sessionManager = new SessionManager();

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
                    sessionManager.joinMatchmaking(ws, msg.playerName);
                    break;

                case 'joinGame': {
                    const identity = sessionManager.playerIdentities.get(msg.guestPlayerId);
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
                        const ok = messenger.reconnect(identity.color, ws);
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
