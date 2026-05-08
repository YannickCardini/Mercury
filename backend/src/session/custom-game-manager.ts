// ─────────────────────────────────────────────────────────────────────────────
// CustomGameManager — rooms privées identifiées par un code à 6 caractères
//
// Indépendant de MatchmakingManager : chaque room est isolée. Le créateur
// occupe la couleur red, puis green/blue/orange sont attribuées aux joiners.
// Le créateur peut lancer la partie quand il le souhaite :
//   - 4 joueurs présents → partie immédiate
//   - moins de 4         → tous les joueurs sont reversés dans le matchmaking
//                          public (file d'attente avec bots).
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Game } from '../game/game.js';
import { MultiWsMessenger } from '../game/game-messenger.js';
import { GameRegistry } from './game-registry.js';
import type { GameConfig, MarbleColor, ClientMessage, CustomRoomPlayerInfo } from '@mercury/shared';
import type { MatchmakingManager } from './matchmaking-manager.js';
import type { PresenceManager } from './presence-manager.js';

const COLORS: MarbleColor[] = ['red', 'green', 'blue', 'orange'];
const ROOM_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

interface CustomPlayer {
    ws: WebSocket;
    color: MarbleColor;
    name: string;
    picture?: string;
    userId?: string;
    guestPlayerId: string;
    browserId?: string;
    /** Listener installed on this ws to handle in-room messages (start/leave). */
    roomMessageListener: (raw: MessageEvent) => void;
}

interface CustomRoom {
    code: string;
    creatorWs: WebSocket;
    messenger: MultiWsMessenger;
    players: CustomPlayer[];
    expiryTimer: NodeJS.Timeout;
    /** Shared map injected from SessionManager so reconnect lookups work. */
    playerIdentities: Map<string, { gameId: string; color: MarbleColor }>;
}

function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class CustomGameManager {

    private rooms = new Map<string, CustomRoom>();

    constructor(
        private playerIdentities: Map<string, { gameId: string; color: MarbleColor }>,
        private matchmaking: MatchmakingManager,
        private presence: PresenceManager,
    ) { }

    createRoom(
        ws: WebSocket,
        info: { playerName: string; browserId?: string; picture?: string; userId?: string },
    ): void {
        let code: string;
        do { code = generateRoomCode(); } while (this.rooms.has(code));

        const messenger = new MultiWsMessenger();
        const guestPlayerId = crypto.randomUUID();

        const player = this.makePlayer(ws, 'red', info, guestPlayerId);
        const room: CustomRoom = {
            code,
            creatorWs: ws,
            messenger,
            players: [player],
            expiryTimer: setTimeout(() => this.expireRoom(code), ROOM_INACTIVITY_MS),
            playerIdentities: this.playerIdentities,
        };

        messenger.addConnection('red', ws);
        this.rooms.set(code, room);
        if (info.userId) this.presence.register(info.userId, ws);
        ws.addEventListener('message', player.roomMessageListener);
        ws.addEventListener('close', () => this.handleDisconnect(code, 'red'));

        this.broadcastStatus(code);
        console.log(`🏠 Custom room ${code} created by ${info.playerName}`);
    }

    joinRoom(
        ws: WebSocket,
        code: string,
        info: { playerName: string; browserId?: string; picture?: string; userId?: string },
    ): void {
        const room = this.rooms.get(code);
        if (!room) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: `Room ${code} not found` }));
            return;
        }
        if (info.browserId && room.players.some(p => p.browserId === info.browserId)) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Already in this room from another tab' }));
            return;
        }
        const taken = new Set(room.players.map(p => p.color));
        const color = COLORS.find(c => !taken.has(c));
        if (!color) {
            ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Room is full' }));
            return;
        }

        const guestPlayerId = crypto.randomUUID();
        const resolvedInfo = {
            ...info,
            playerName: info.playerName && info.playerName.length > 0
                ? info.playerName
                : `Guest #${COLORS.indexOf(color) + 1}`,
        };
        const player = this.makePlayer(ws, color, resolvedInfo, guestPlayerId);
        room.players.push(player);
        room.messenger.addConnection(color, ws);
        if (info.userId) this.presence.register(info.userId, ws);
        ws.addEventListener('message', player.roomMessageListener);
        ws.addEventListener('close', () => this.handleDisconnect(code, color));

        this.bumpExpiry(room);
        this.broadcastStatus(code);
        console.log(`➕ ${resolvedInfo.playerName} (${color}) joined custom room ${code}`);
    }

    private makePlayer(
        ws: WebSocket,
        color: MarbleColor,
        info: { playerName: string; browserId?: string; picture?: string; userId?: string },
        guestPlayerId: string,
    ): CustomPlayer {
        const player: CustomPlayer = {
            ws,
            color,
            name: info.playerName,
            guestPlayerId,
            ...(info.picture ? { picture: info.picture } : {}),
            ...(info.userId ? { userId: info.userId } : {}),
            ...(info.browserId ? { browserId: info.browserId } : {}),
            roomMessageListener: () => { /* replaced below */ },
        };
        // Listener handles only pre-launch messages (start/leave). Once the room
        // is destroyed or upgraded to a Game, it becomes a no-op since the ws is
        // no longer in any room.
        player.roomMessageListener = (raw: MessageEvent) => {
            try {
                const msg = JSON.parse(raw.data as string) as ClientMessage;
                if (msg.type === 'startCustomRoom') {
                    this.startRoomFromCreator(ws);
                } else if (msg.type === 'inviteUser') {
                    this.handleInviteUser(ws, msg.toUserId, msg.roomCode);
                } else if (msg.type === 'inviteResponse') {
                    this.presence.send(msg.fromUserId, {
                        type: 'gameInviteResponse',
                        fromUserId: player.userId ?? '',
                        accepted: msg.accepted,
                    });
                }
            } catch { /* ignore */ }
        };
        return player;
    }

    /**
     * Push a `gameInvite` to the recipient's online socket(s). Only the room
     * creator can send invites, and only for their own room. If the recipient
     * is offline, push an immediate `gameInviteResponse` with accepted=false
     * back to the creator so their UI can flip to "undelivered/declined".
     */
    private handleInviteUser(ws: WebSocket, toUserId: string, roomCode: string): void {
        const room = this.rooms.get(roomCode);
        if (!room || room.creatorWs !== ws) return;
        const creator = room.players.find(p => p.ws === ws);
        if (!creator || !creator.userId) return;
        const delivered = this.presence.send(toUserId, {
            type: 'gameInvite',
            fromUserId: creator.userId,
            fromUserName: creator.name,
            ...(creator.picture ? { fromUserPicture: creator.picture } : {}),
            roomCode: room.code,
        });
        if (!delivered) {
            try {
                ws.send(JSON.stringify({
                    type: 'gameInviteResponse',
                    fromUserId: toUserId,
                    accepted: false,
                }));
            } catch { /* ignore */ }
        }
    }

    private startRoomFromCreator(ws: WebSocket): void {
        for (const [code, room] of this.rooms) {
            if (room.creatorWs !== ws) continue;
            if (room.players.length === 4) {
                this.cleanupListeners(room);
                clearTimeout(room.expiryTimer);
                this.rooms.delete(code);
                this.launch(room);
            } else {
                this.cleanupListeners(room);
                clearTimeout(room.expiryTimer);
                this.rooms.delete(code);
                this.fallbackToMatchmaking(room);
            }
            return;
        }
        ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Only the room creator can start the game' }));
    }

    private cleanupListeners(room: CustomRoom): void {
        for (const p of room.players) {
            p.ws.removeEventListener('message', p.roomMessageListener);
        }
    }

    private launch(room: CustomRoom): void {
        const playersByColor = new Map(room.players.map(p => [p.color, p]));
        const config: GameConfig = {
            players: COLORS.map(color => {
                const p = playersByColor.get(color)!;
                return {
                    color,
                    name: p.name,
                    isHuman: true,
                    ...(p.picture ? { picture: p.picture } : {}),
                    ...(p.userId ? { userId: p.userId } : {}),
                };
            }),
        };

        const messenger = room.messenger;
        const players = [...room.players];
        const playerIdentities = room.playerIdentities;

        console.log(`🚀 Custom room ${room.code} — launching with 4 players`);
        const game = new Game(config, messenger);
        GameRegistry.register(game.id, game);
        messenger.setOnPermanentDisconnect((color) => game.markDisconnected(color));
        game.setOnPlayerAbandoned((gameId, color) => {
            for (const [guestId, identity] of playerIdentities) {
                if (identity.gameId === gameId && identity.color === color) {
                    playerIdentities.delete(guestId);
                    break;
                }
            }
        });
        for (const p of players) {
            playerIdentities.set(p.guestPlayerId, { gameId: game.id, color: p.color });
            messenger.sendTo(p.color, {
                type: 'welcome',
                message: 'Game started',
                timestamp: new Date().toISOString(),
                gameState: null,
                guestPlayerId: p.guestPlayerId,
                gameId: game.id,
            });
        }
    }

    private fallbackToMatchmaking(room: CustomRoom): void {
        console.log(`⤵️ Custom room ${room.code} starting with ${room.players.length} player(s) — moving to matchmaking`);
        // Snapshot players before iterating; joinQueue may close/replace state.
        const players = [...room.players];
        for (const p of players) {
            this.matchmaking.joinQueue(
                p.ws,
                p.name,
                room.playerIdentities,
                p.browserId,
                p.picture,
                p.userId,
            );
        }
    }

    private handleDisconnect(code: string, color: MarbleColor): void {
        const room = this.rooms.get(code);
        if (!room) return;

        const wasCreator = room.players.find(p => p.color === color)?.ws === room.creatorWs;
        const leaving = room.players.find(p => p.color === color);
        room.players = room.players.filter(p => p.color !== color);
        if (leaving) {
            leaving.ws.removeEventListener('message', leaving.roomMessageListener);
            this.presence.unregister(leaving.ws);
        }

        if (wasCreator) {
            // Notify and destroy.
            for (const p of room.players) {
                try {
                    p.ws.send(JSON.stringify({ type: 'actionRejected', reason: 'The room creator left — room destroyed.' }));
                } catch { /* ignore */ }
                p.ws.removeEventListener('message', p.roomMessageListener);
            }
            clearTimeout(room.expiryTimer);
            this.rooms.delete(code);
            console.log(`❌ Custom room ${code} destroyed (creator left)`);
            return;
        }

        if (room.players.length === 0) {
            clearTimeout(room.expiryTimer);
            this.rooms.delete(code);
            console.log(`❌ Custom room ${code} destroyed (empty)`);
            return;
        }

        this.bumpExpiry(room);
        this.broadcastStatus(code);
    }

    private broadcastStatus(code: string): void {
        const room = this.rooms.get(code);
        if (!room) return;
        const playersInfo: CustomRoomPlayerInfo[] = room.players.map(p => ({
            color: p.color,
            name: p.name,
            isCreator: p.ws === room.creatorWs,
            ...(p.picture ? { picture: p.picture } : {}),
            ...(p.userId ? { userId: p.userId } : {}),
        }));
        for (const p of room.players) {
            try {
                p.ws.send(JSON.stringify({
                    type: 'customRoomStatus',
                    code,
                    myColor: p.color,
                    guestPlayerId: p.guestPlayerId,
                    isCreator: p.ws === room.creatorWs,
                    players: playersInfo,
                }));
            } catch { /* ignore */ }
        }
    }

    private bumpExpiry(room: CustomRoom): void {
        clearTimeout(room.expiryTimer);
        room.expiryTimer = setTimeout(() => this.expireRoom(room.code), ROOM_INACTIVITY_MS);
    }

    private expireRoom(code: string): void {
        const room = this.rooms.get(code);
        if (!room) return;
        for (const p of room.players) {
            try {
                p.ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Room expired due to inactivity.' }));
            } catch { /* ignore */ }
            p.ws.removeEventListener('message', p.roomMessageListener);
        }
        this.rooms.delete(code);
        console.log(`⏰ Custom room ${code} expired`);
    }
}
