import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { SessionManager } from './session/session-manager.js';
import type { ClientMessage } from '@keezen/shared';

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
