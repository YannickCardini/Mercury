import crypto from 'node:crypto';
import { Game } from '../game/game.js';
import { SingleWsMessenger, MultiWsMessenger, wsSend } from '../game/game-messenger.js';
import { MatchmakingManager } from './matchmaking-manager.js';
import { CustomGameManager } from './custom-game-manager.js';
import { PresenceManager } from './presence-manager.js';
import { GameRegistry } from './game-registry.js';
import { ReconnectRegistry } from './reconnect-registry.js';
import { generateRoomCode } from '../utils/utils.js';
import type { ClientMessage, GameConfig, MarbleColor } from '@mercury/shared';

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

export class SessionManager {

    private rooms = new Map<string, PendingRoom>();
    private matchmaking = new MatchmakingManager();

    /** Reconnection slots, indexed by guestPlayerId and (for signed-in) userId. */
    readonly reconnect = new ReconnectRegistry();

    readonly presence = new PresenceManager();

    private customGames = new CustomGameManager(this.reconnect, this.matchmaking, this.presence);

    // Pas de constructeur : `PresenceManager.register` flushe nativement la
    // file in-memory à chaque (ré-)enregistrement, ce qui couvre la livraison
    // des `gameInvite` queued pour les utilisateurs offline.

    /**
     * Enregistre un WebSocket "présence" pour un utilisateur signed-in idle
     * sur la home page, et installe un listener pour ses messages futurs
     * (réponses aux invitations).
     */
    registerPresence(ws: WebSocket, userId: string): void {
        this.presence.register(userId, ws);

        const listener = (raw: MessageEvent) => {
            try {
                const msg = JSON.parse(raw.data as string) as ClientMessage;
                if (msg.type === 'inviteResponse') {
                    this.presence.send(msg.fromUserId, {
                        type: 'gameInviteResponse',
                        fromUserId: userId,
                        accepted: msg.accepted,
                    });
                }
            } catch { /* ignore */ }
        };

        ws.addEventListener('message', listener);
        ws.addEventListener('close', () => {
            ws.removeEventListener('message', listener);
            this.presence.unregister(ws);
        });
    }

    /**
     * Mode DEBUG : lance immédiatement une partie 1 humain (red) vs 3 bots IA
     * sur le WS courant. Saute la file de matchmaking publique.
     */
    startDebugGameVsBots(ws: WebSocket, playerName?: string, userId?: string, picture?: string): void {
        const humanName = playerName && playerName.length > 0 ? playerName : 'Debug Player';
        const config: GameConfig = {
            players: [
                { color: 'red', name: humanName, isHuman: true, ...(picture ? { picture } : {}), ...(userId ? { userId } : {}) },
                { color: 'green', name: 'Bot Green', isHuman: false },
                { color: 'blue', name: 'Bot Blue', isHuman: false },
                { color: 'orange', name: 'Bot Orange', isHuman: false },
            ],
        };
        // Annonce la couleur au frontend via le canal matchmakingStatus existant,
        // pour que home.page mette à jour myMatchmakingColor avant la navigation.
        wsSend(ws, {
            type: 'matchmakingStatus',
            connectedCount: 1,
            totalNeeded: 4,
            myColor: 'red',
            guestPlayerId: crypto.randomUUID(),
        });
        this.startSingleDevice(ws, config);
        console.log(`🐛 DEBUG — partie instantanée vs 3 bots lancée pour ${humanName}`);
    }

    /**
     * Démarre une partie immédiatement sur le WS courant.
     * Utilisé pour le mode single-device (start message).
     */
    startSingleDevice(ws: WebSocket, config: GameConfig): void {
        const messenger = new SingleWsMessenger(ws);
        const game = new Game(config, messenger);
        GameRegistry.register(game.id, game);
        game.setOnGameEnded((gameId) => this.reconnect.releaseGame(gameId));

        // Generate guest IDs for human players (single-device: only one human expected)
        for (const p of config.players.filter(p => p.isHuman)) {
            const guestId = crypto.randomUUID();
            this.reconnect.register(guestId, game.id, p.color, p.userId);
            // Send welcome with guest identity
            wsSend(ws, {
                type: 'welcome',
                message: 'Game started',
                timestamp: new Date().toISOString(),
                gameState: null,
                guestPlayerId: guestId,
                gameId: game.id,
            });
        }

        // Single-device shares one socket for the whole game; if it closes there
        // is no per-player reconnection, so free the slots to avoid locking a
        // signed-in player out of starting a new game.
        ws.addEventListener('close', () => this.reconnect.releaseGame(game.id), { once: true });

        console.log(`🎮 Partie single-device lancée (game ${game.id})`);
    }

    /**
     * Crée une room multi-device.
     * Si tous les joueurs humains sont gérés depuis ce seul WS (0 ou 1 humain),
     * la partie démarre immédiatement sans attendre de joiners.
     * Sinon, crée une room et envoie le code au créateur.
     */
    createRoom(ws: WebSocket, config: GameConfig): void {
        // Block any signed-in player already engaged in a running game.
        for (const p of config.players) {
            if (p.isHuman && p.userId && this.rejectIfInActiveGame(ws, p.userId)) return;
        }

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

        wsSend(ws, { type: 'roomCreated', roomCode: code });
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
            wsSend(ws, { type: 'actionRejected', reason: `Room ${roomCode} introuvable` });
            return;
        }

        if (!room.humanColors.includes(playerColor)) {
            wsSend(ws, { type: 'actionRejected', reason: `La couleur ${playerColor} n'est pas un joueur humain dans cette room` });
            return;
        }

        if (room.connected.has(playerColor)) {
            wsSend(ws, { type: 'actionRejected', reason: `${playerColor} est déjà connecté` });
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
            const game = new Game(room.config, room.messenger);
            GameRegistry.register(game.id, game);

            // Wire up disconnect callbacks (immediate + permanent)
            room.messenger.setOnTempDisconnect((color) => game.markTempDisconnected(color));
            room.messenger.setOnPermanentDisconnect((color) => game.markDisconnected(color));

            // Wire up reconnection-slot cleanup (single resign + whole game end)
            game.setOnPlayerAbandoned((gameId, color) => this.reconnect.releaseSlot(gameId, color));
            game.setOnGameEnded((gameId) => this.reconnect.releaseGame(gameId));

            // Generate guest IDs for each human player and send welcome
            for (const hc of room.humanColors) {
                const guestId = crypto.randomUUID();
                const userId = room.config.players.find(p => p.color === hc)?.userId;
                this.reconnect.register(guestId, game.id, hc, userId);
                room.messenger.sendTo(hc, {
                    type: 'welcome',
                    message: 'Game started',
                    timestamp: new Date().toISOString(),
                    gameState: null,
                    guestPlayerId: guestId,
                    gameId: game.id,
                });
            }
        }
    }

    /**
     * Rejoint la file d'attente matchmaking publique.
     * Le serveur assigne une couleur et démarre la partie dès que 4 joueurs sont là
     * (ou remplit avec des bots après 60 s).
     */
    joinMatchmaking(ws: WebSocket, playerName?: string, browserId?: string, picture?: string, userId?: string): void {
        if (userId && this.rejectIfInActiveGame(ws, userId)) return;
        this.matchmaking.joinQueue(ws, playerName, this.reconnect, browserId, picture, userId);
    }

    /** Crée une custom room et inscrit le créateur (red). */
    createCustomRoom(
        ws: WebSocket,
        info: { playerName: string; browserId?: string; picture?: string; userId?: string },
    ): void {
        if (info.userId && this.rejectIfInActiveGame(ws, info.userId)) return;
        this.customGames.createRoom(ws, info);
    }

    /** Rejoint une custom room existante via son code. */
    joinCustomRoom(
        ws: WebSocket,
        code: string,
        info: { playerName: string; browserId?: string; picture?: string; userId?: string },
    ): void {
        if (info.userId && this.rejectIfInActiveGame(ws, info.userId)) return;
        this.customGames.joinRoom(ws, code, info);
    }

    /**
     * If `userId` is already a player in a running game, push an
     * `alreadyInActiveGame` message (carrying the reconnect info) and return
     * true so the caller aborts the join. Stale entries (game already gone)
     * are self-healed and treated as "not in a game".
     */
    private rejectIfInActiveGame(ws: WebSocket, userId: string): boolean {
        const active = this.reconnect.getActiveGameForUser(userId);
        if (!active) return false;
        if (!GameRegistry.get(active.gameId)) {
            this.reconnect.releaseGame(active.gameId);
            return false;
        }
        wsSend(ws, {
            type: 'alreadyInActiveGame',
            gameId: active.gameId,
            guestPlayerId: active.guestPlayerId,
            color: active.color,
        });
        return true;
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
