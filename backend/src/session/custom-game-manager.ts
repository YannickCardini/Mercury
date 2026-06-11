// ─────────────────────────────────────────────────────────────────────────────
// CustomGameManager — rooms privées identifiées par un code à 6 caractères
//
// Indépendant de MatchmakingManager : chaque room est isolée. Le créateur
// occupe la couleur red, puis green/blue/orange sont attribuées aux joiners.
// Le créateur peut lancer la partie quand il le souhaite :
//   - 4 joueurs présents → partie immédiate
//   - moins de 4         → tous les joueurs sont reversés dans le matchmaking
//                          public (file d'attente avec bots).
//
// Une déconnexion WebSocket dans une room non encore lancée n'éjecte plus
// immédiatement le joueur : une fenêtre de grace de 60 s permet une
// reconnexion (typiquement quand l'utilisateur a backgroundé l'app mobile).
// Un message `leaveCustomRoom` explicite court-circuite la grace.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Game } from '../game/game.js';
import { MultiWsMessenger } from '../game/game-messenger.js';
import { GameRegistry } from './game-registry.js';
import type { GameConfig, MarbleColor, ClientMessage, CustomRoomPlayerInfo } from '@mercury/shared';
import type { MatchmakingManager } from './matchmaking-manager.js';
import type { PresenceManager } from './presence-manager.js';
import type { ReconnectRegistry } from './reconnect-registry.js';

const INVITATION_TTL_MS = 5 * 60 * 1000;
const GRACE_PERIOD_MS = 60 * 1000;

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
    /** Listener installed on this ws to handle close — kept for explicit removal on swap. */
    closeListener: () => void;
    isConnected: boolean;
    /** Active when isConnected === false; cleared on reconnect or expiry. */
    graceTimer: NodeJS.Timeout | null;
}

interface CustomRoom {
    code: string;
    creatorColor: MarbleColor;
    creatorUserId?: string;
    messenger: MultiWsMessenger;
    players: CustomPlayer[];
    expiryTimer: NodeJS.Timeout;
    /** Set of userIds invited via handleInviteUser — used to broadcast cancel on teardown. */
    invitees: Set<string>;
    /** Shared registry injected from SessionManager so reconnect lookups work. */
    reconnect: ReconnectRegistry;
}

function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** Type-narrowing helper : un message queued par `PresenceManager` est un
 *  gameInvite portant le `roomCode` cherché. */
function isInvitePayloadForRoom(msg: object, roomCode: string): boolean {
    const m = msg as { type?: string; roomCode?: string };
    return m.type === 'gameInvite' && m.roomCode === roomCode;
}

export class CustomGameManager {

    private rooms = new Map<string, CustomRoom>();

    constructor(
        private reconnect: ReconnectRegistry,
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

        const room: CustomRoom = {
            code,
            creatorColor: 'red',
            ...(info.userId ? { creatorUserId: info.userId } : {}),
            messenger,
            players: [],
            expiryTimer: setTimeout(() => this.expireRoom(code), ROOM_INACTIVITY_MS),
            invitees: new Set(),
            reconnect: this.reconnect,
        };
        this.rooms.set(code, room);

        const player = this.makePlayer(ws, 'red', info, guestPlayerId, code);
        room.players.push(player);

        messenger.addConnection('red', ws);
        if (info.userId) this.presence.register(info.userId, ws);

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

        // ── Reconnect path ──────────────────────────────────────────────────
        // If a player with the same userId (or browserId) is in their grace
        // window (disconnected, awaiting reconnect), swap them onto this new
        // ws. If they're still actively connected, this is a multi-tab attempt
        // — reject as before.
        const existing = this.findExistingPlayer(room, info.userId, info.browserId);
        if (existing) {
            if (existing.isConnected) {
                ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Already in this room from another tab' }));
                return;
            }
            this.rebindPlayer(room, existing, ws, info);
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
        const player = this.makePlayer(ws, color, resolvedInfo, guestPlayerId, code);
        room.players.push(player);
        room.messenger.addConnection(color, ws);
        if (info.userId) this.presence.register(info.userId, ws);

        this.bumpExpiry(room);
        this.broadcastStatus(code);
        console.log(`➕ ${resolvedInfo.playerName} (${color}) joined custom room ${code}`);
    }

    private findExistingPlayer(
        room: CustomRoom,
        userId?: string,
        browserId?: string,
    ): CustomPlayer | undefined {
        if (userId) {
            const byUser = room.players.find(p => p.userId === userId);
            if (byUser) return byUser;
        }
        if (browserId) {
            const byBrowser = room.players.find(p => p.browserId === browserId);
            if (byBrowser) return byBrowser;
        }
        return undefined;
    }

    /**
     * Reconnect or replace the WebSocket of an existing player slot. Used both
     * for "user came back from background within 60 s" and for "user opened
     * a second tab" (in which case the older tab is implicitly displaced).
     */
    private rebindPlayer(
        room: CustomRoom,
        existing: CustomPlayer,
        ws: WebSocket,
        info: { playerName: string; browserId?: string; picture?: string; userId?: string },
    ): void {
        // Cancel any pending grace removal.
        if (existing.graceTimer) {
            clearTimeout(existing.graceTimer);
            existing.graceTimer = null;
        }

        // Detach listeners from the previous ws (might still be open if this
        // is a multi-tab swap rather than a reconnect after close).
        const previousWs = existing.ws;
        try { previousWs.removeEventListener('message', existing.roomMessageListener); } catch { /* ignore */ }
        try { previousWs.removeEventListener('close', existing.closeListener); } catch { /* ignore */ }
        this.presence.unregister(previousWs);

        // Wire the new ws into the slot.
        existing.ws = ws;
        existing.isConnected = true;
        if (info.picture) existing.picture = info.picture;
        if (info.browserId) existing.browserId = info.browserId;

        const newListener: (raw: MessageEvent) => void = (raw) => this.handleRoomMessage(ws, raw, existing);
        existing.roomMessageListener = newListener;
        const newCloseListener = () => this.handleDisconnect(room.code, existing.color);
        existing.closeListener = newCloseListener;
        ws.addEventListener('message', newListener);
        ws.addEventListener('close', newCloseListener);

        room.messenger.addConnection(existing.color, ws);
        if (info.userId) this.presence.register(info.userId, ws);

        this.bumpExpiry(room);
        this.broadcastStatus(room.code);
        console.log(`🔄 ${existing.name} (${existing.color}) reconnected to room ${room.code}`);
    }

    private makePlayer(
        ws: WebSocket,
        color: MarbleColor,
        info: { playerName: string; browserId?: string; picture?: string; userId?: string },
        guestPlayerId: string,
        code: string,
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
            closeListener: () => { /* replaced below */ },
            isConnected: true,
            graceTimer: null,
        };
        player.roomMessageListener = (raw) => this.handleRoomMessage(ws, raw, player);
        player.closeListener = () => this.handleDisconnect(code, color);
        ws.addEventListener('message', player.roomMessageListener);
        ws.addEventListener('close', player.closeListener);
        return player;
    }

    private handleRoomMessage(ws: WebSocket, raw: MessageEvent, player: CustomPlayer): void {
        try {
            const msg = JSON.parse(raw.data as string) as ClientMessage;
            if (msg.type === 'startCustomRoom') {
                this.startRoomFromCreator(ws);
            } else if (msg.type === 'leaveCustomRoom') {
                this.handleLeave(ws, player.color);
            } else if (msg.type === 'inviteUser') {
                this.handleInviteUser(ws, msg.toUserId, msg.roomCode);
            } else if (msg.type === 'cancelInvite') {
                this.handleCancelInvite(ws, msg.toUserId, msg.roomCode);
            } else if (msg.type === 'inviteResponse') {
                this.presence.send(msg.fromUserId, {
                    type: 'gameInviteResponse',
                    fromUserId: player.userId ?? '',
                    accepted: msg.accepted,
                });
            }
        } catch { /* ignore */ }
    }

    /**
     * Push a `gameInvite` to the recipient. Only the room creator can send
     * invites, and only for their own room.
     *
     * Persistance offline : on s'appuie sur `PresenceManager.sendOrQueue`.
     * Si l'invité a au moins une socket de présence ouverte, le message est
     * délivré tout de suite. Sinon il reste en file in-memory pour 5 min
     * (TTL identique à l'ancien `defaultTtl` Cosmos) et sera flushé
     * automatiquement quand l'invité ré-enregistrera sa présence. Si la TTL
     * expire avant retour, l'entrée est silencieusement abandonnée et on
     * retire l'invité de `room.invitees` pour cohérence du cancel broadcast.
     */
    private handleInviteUser(ws: WebSocket, toUserId: string, roomCode: string): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;
        const creator = room.players.find(p => p.color === room.creatorColor);
        if (!creator || creator.ws !== ws || !creator.userId) return;

        room.invitees.add(toUserId);

        const invitePayload = {
            type: 'gameInvite' as const,
            fromUserId: creator.userId,
            fromUserName: creator.name,
            ...(creator.picture ? { fromUserPicture: creator.picture } : {}),
            roomCode: room.code,
        };

        this.presence.sendOrQueue(toUserId, invitePayload, INVITATION_TTL_MS, () => {
            // TTL expirée sans reconnexion : on ne peut plus livrer.
            // Retire l'invité du registre pour éviter un cancel broadcast inutile.
            const currentRoom = this.rooms.get(roomCode);
            currentRoom?.invitees.delete(toUserId);
        });
    }

    /**
     * Manual cancellation of a single invitation by the creator. Removes any
     * queued copy in `PresenceManager` and pushes a `gameInviteCancelled` to
     * the recipient if currently online.
     */
    private handleCancelInvite(ws: WebSocket, toUserId: string, roomCode: string): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;
        const creator = room.players.find(p => p.color === room.creatorColor);
        if (!creator || creator.ws !== ws || !creator.userId) return;

        room.invitees.delete(toUserId);
        this.presence.cancelQueued(toUserId, m => isInvitePayloadForRoom(m, roomCode));
        this.presence.send(toUserId, {
            type: 'gameInviteCancelled',
            fromUserId: creator.userId,
            roomCode: room.code,
        });
    }

    /**
     * Quand une room est détruite, on prévient les invités en ligne via
     * `gameInviteCancelled` ET on retire les invitations encore en file pour
     * les invités offline — sinon ils verraient une invitation périmée à
     * leur prochaine reconnexion.
     */
    private broadcastCancelToInvitees(room: CustomRoom, fromUserId: string): void {
        for (const toUserId of room.invitees) {
            this.presence.cancelQueued(toUserId, m => isInvitePayloadForRoom(m, room.code));
            this.presence.send(toUserId, {
                type: 'gameInviteCancelled',
                fromUserId,
                roomCode: room.code,
            });
        }
        room.invitees.clear();
    }

    private startRoomFromCreator(ws: WebSocket): void {
        for (const [code, room] of this.rooms) {
            const creator = room.players.find(p => p.color === room.creatorColor);
            if (!creator || creator.ws !== ws) continue;
            this.cleanupListeners(room);
            this.clearAllGraceTimers(room);
            clearTimeout(room.expiryTimer);
            this.rooms.delete(code);
            if (creator.userId) this.broadcastCancelToInvitees(room, creator.userId);
            if (room.players.length === 4) {
                this.launch(room);
            } else {
                this.fallbackToMatchmaking(room);
            }
            return;
        }
        ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Only the room creator can start the game' }));
    }

    private cleanupListeners(room: CustomRoom): void {
        for (const p of room.players) {
            try { p.ws.removeEventListener('message', p.roomMessageListener); } catch { /* ignore */ }
            try { p.ws.removeEventListener('close', p.closeListener); } catch { /* ignore */ }
        }
    }

    private clearAllGraceTimers(room: CustomRoom): void {
        for (const p of room.players) {
            if (p.graceTimer) {
                clearTimeout(p.graceTimer);
                p.graceTimer = null;
            }
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
        const reconnect = room.reconnect;

        console.log(`🚀 Custom room ${room.code} — launching with 4 players`);
        const game = new Game(config, messenger);
        GameRegistry.register(game.id, game);
        messenger.setOnTempDisconnect((color) => game.markTempDisconnected(color));
        messenger.setOnPermanentDisconnect((color) => game.markDisconnected(color));
        game.setOnPlayerAbandoned((gameId, color) => reconnect.releaseSlot(gameId, color));
        game.setOnGameEnded((gameId) => reconnect.releaseGame(gameId));
        for (const p of players) {
            reconnect.register(p.guestPlayerId, game.id, p.color, p.userId);
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
                room.reconnect,
                p.browserId,
                p.picture,
                p.userId,
            );
        }
    }

    /**
     * Called when the player's ws closes (background, network drop, tab close,
     * …). Starts a 60 s grace window during which the slot is held; a
     * subsequent `joinCustomRoom` from the same userId/browserId rebinds the
     * slot. If the window expires, the slot is removed and the room may be
     * destroyed (creator slot) or marked empty.
     */
    private handleDisconnect(code: string, color: MarbleColor): void {
        const room = this.rooms.get(code);
        if (!room) return;
        const leaving = room.players.find(p => p.color === color);
        if (!leaving || !leaving.isConnected) return; // already in grace or removed

        leaving.isConnected = false;
        this.presence.unregister(leaving.ws);

        leaving.graceTimer = setTimeout(() => {
            leaving.graceTimer = null;
            this.finalizeRemoval(code, color);
        }, GRACE_PERIOD_MS);

        console.log(`⏳ ${leaving.name} (${color}) disconnected from room ${code} — 60s grace`);
    }

    /**
     * Immediate, non-graceful removal: handles `leaveCustomRoom` messages and
     * also runs after the grace timer fires.
     */
    private handleLeave(ws: WebSocket, color: MarbleColor): void {
        // Find the room this ws belongs to.
        for (const [code, room] of this.rooms) {
            const leaving = room.players.find(p => p.color === color && p.ws === ws);
            if (!leaving) continue;
            if (leaving.graceTimer) {
                clearTimeout(leaving.graceTimer);
                leaving.graceTimer = null;
            }
            this.finalizeRemoval(code, color);
            return;
        }
    }

    private finalizeRemoval(code: string, color: MarbleColor): void {
        const room = this.rooms.get(code);
        if (!room) return;
        const leaving = room.players.find(p => p.color === color);
        if (!leaving) return;

        const wasCreator = color === room.creatorColor;
        room.players = room.players.filter(p => p.color !== color);
        try { leaving.ws.removeEventListener('message', leaving.roomMessageListener); } catch { /* ignore */ }
        try { leaving.ws.removeEventListener('close', leaving.closeListener); } catch { /* ignore */ }
        this.presence.unregister(leaving.ws);

        if (wasCreator) {
            for (const p of room.players) {
                try {
                    p.ws.send(JSON.stringify({ type: 'actionRejected', reason: 'The room creator left — room destroyed.' }));
                } catch { /* ignore */ }
                try { p.ws.removeEventListener('message', p.roomMessageListener); } catch { /* ignore */ }
                try { p.ws.removeEventListener('close', p.closeListener); } catch { /* ignore */ }
                if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null; }
            }
            clearTimeout(room.expiryTimer);
            this.rooms.delete(code);
            if (leaving.userId) this.broadcastCancelToInvitees(room, leaving.userId);
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
            isCreator: p.color === room.creatorColor,
            ...(p.picture ? { picture: p.picture } : {}),
            ...(p.userId ? { userId: p.userId } : {}),
        }));
        for (const p of room.players) {
            if (!p.isConnected) continue;
            try {
                p.ws.send(JSON.stringify({
                    type: 'customRoomStatus',
                    code,
                    myColor: p.color,
                    guestPlayerId: p.guestPlayerId,
                    isCreator: p.color === room.creatorColor,
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
        const creator = room.players.find(p => p.color === room.creatorColor);
        for (const p of room.players) {
            try {
                p.ws.send(JSON.stringify({ type: 'actionRejected', reason: 'Room expired due to inactivity.' }));
            } catch { /* ignore */ }
            try { p.ws.removeEventListener('message', p.roomMessageListener); } catch { /* ignore */ }
            try { p.ws.removeEventListener('close', p.closeListener); } catch { /* ignore */ }
            if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null; }
        }
        this.rooms.delete(code);
        if (creator?.userId) this.broadcastCancelToInvitees(room, creator.userId);
        console.log(`⏰ Custom room ${code} expired`);
    }
}
