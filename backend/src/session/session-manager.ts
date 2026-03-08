import { Game } from '../game/game.js';
import { SingleWsMessenger, MultiWsMessenger } from '../game/game-messenger.js';
import type { GameConfig, MarbleColor } from '@keezen/shared';

// ─────────────────────────────────────────────────────────────────────────────
// SessionManager — gestion des rooms multi-device
//
// Deux modes :
//  • start / createRoom avec 0-1 humain → SingleWsMessenger, partie immédiate
//  • createRoom avec ≥2 humains         → MultiWsMessenger, attente des joiners
// ─────────────────────────────────────────────────────────────────────────────

interface PendingRoom {
    config: GameConfig;
    messenger: MultiWsMessenger;
    humanColors: MarbleColor[];
    connected: Set<MarbleColor>;
}

function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class SessionManager {

    private rooms = new Map<string, PendingRoom>();

    /**
     * Démarre une partie immédiatement sur le WS courant.
     * Utilisé pour le mode single-device (start message).
     */
    startSingleDevice(ws: WebSocket, config: GameConfig): void {
        const messenger = new SingleWsMessenger(ws);
        new Game(config, messenger);
        console.log(`🎮 Partie single-device lancée`);
    }

    /**
     * Crée une room multi-device.
     * Si tous les joueurs humains sont gérés depuis ce seul WS (0 ou 1 humain),
     * la partie démarre immédiatement sans attendre de joiners.
     * Sinon, crée une room et envoie le code au créateur.
     */
    createRoom(ws: WebSocket, config: GameConfig): void {
        const humanColors = config.players
            .filter(p => p.isHuman)
            .map(p => p.color);

        if (humanColors.length <= 1) {
            // Pas besoin d'attendre d'autres connexions
            this.startSingleDevice(ws, config);
            return;
        }

        // Multi-device : créer la room et attendre les autres joueurs
        const code = generateRoomCode();
        const messenger = new MultiWsMessenger();
        const hostColor = humanColors[0]!;

        messenger.addConnection(hostColor, ws);

        const room: PendingRoom = {
            config,
            messenger,
            humanColors,
            connected: new Set([hostColor]),
        };

        this.rooms.set(code, room);

        ws.send(JSON.stringify({ type: 'roomCreated', roomCode: code }));
        this.broadcastRoomStatus(code);

        console.log(`🏠 Room ${code} créée (${hostColor} connecté, en attente de ${humanColors.slice(1).join(', ')})`);
    }

    /**
     * Rejoint une room existante avec un nouveau WS.
     * Lance la partie dès que tous les joueurs humains sont connectés.
     */
    joinRoom(ws: WebSocket, roomCode: string, playerColor: MarbleColor): void {
        const room = this.rooms.get(roomCode);

        if (!room) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: `Room ${roomCode} introuvable` }));
            return;
        }

        if (!room.humanColors.includes(playerColor)) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: `La couleur ${playerColor} n'est pas un joueur humain dans cette room` }));
            return;
        }

        if (room.connected.has(playerColor)) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: `${playerColor} est déjà connecté` }));
            return;
        }

        room.messenger.addConnection(playerColor, ws);
        room.connected.add(playerColor);

        console.log(`➕ ${playerColor} a rejoint la room ${roomCode}`);
        this.broadcastRoomStatus(roomCode);

        // Lancer la partie si tout le monde est là
        if (room.humanColors.every(c => room.connected.has(c))) {
            this.rooms.delete(roomCode);
            console.log(`🚀 Room ${roomCode} complète — lancement de la partie`);
            new Game(room.config, room.messenger);
        }
    }

    private broadcastRoomStatus(roomCode: string): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        const missing = room.humanColors.filter(c => !room.connected.has(c));
        room.messenger.send({
            type: 'waitingForPlayers',
            connected: [...room.connected],
            missing,
        });
    }
}
