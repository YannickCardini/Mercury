import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer } from 'http'; // INDISPENSABLE
import { WebSocketServer } from 'ws';
import { Game } from './game/game.js';

// 1. Initialise Express
const app = express();
app.use(cors());

// 2. Crée le serveur HTTP "parent"
const server = createServer(app);

// 3. Initialise WebSocket en le liant au serveur HTTP (SANS donner de port !)
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

app.get('/', (req: Request, res: Response) => {
    res.send({ message: 'Keezen API est en ligne avec WebSockets !' });
});


wss.on('connection', (ws: WebSocket) => {
    console.log('✅ Client connecté');
    new Game(ws);

});

server.listen(PORT, () => {
    console.log(`🚀 Serveur hybride (HTTP + WS) prêt sur le port ${PORT}`);
});
console.log('🃏 Jeu de 52 cartes chargé');
