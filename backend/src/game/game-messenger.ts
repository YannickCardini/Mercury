import type { ClientMessage, ServerMessage, MarbleColor } from '@mercury/shared';

// ─────────────────────────────────────────────────────────────────────────────
// GameMessenger — abstraction de la couche WebSocket
//
// Permet à Game de ne pas connaître si on est en mode single-WS ou multi-WS.
// Deux implémentations :
//  - SingleWsMessenger  : tous les joueurs sur le même WebSocket (même écran)
//  - MultiWsMessenger   : chaque joueur humain a son propre WebSocket
// ─────────────────────────────────────────────────────────────────────────────

/** Callback appelé à chaque message reçu d'un client.
 *  `senderColor` est null en mode single-WS (on ne peut pas identifier qui envoie). */
export type MessageHandler = (msg: ClientMessage, senderColor: MarbleColor | null) => void;

export interface GameMessenger {
    /** Envoie un message à tous les clients connectés. */
    send(msg: ServerMessage): void;
    /** Envoie un message à un joueur spécifique (no-op si non connecté). */
    sendTo(color: MarbleColor, msg: ServerMessage): void;
    /** Enregistre le handler appelé à chaque message entrant. */
    onMessage(handler: MessageHandler): void;
}

/**
 * Envoi typé sur un WebSocket brut (hors messenger) : garantit à la compilation
 * que tout message sortant respecte le contrat ServerMessage de @mercury/shared.
 */
export function wsSend(ws: WebSocket, msg: ServerMessage): void {
    ws.send(JSON.stringify(msg));
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-device : un seul WebSocket pour tous les joueurs
// ─────────────────────────────────────────────────────────────────────────────

export class SingleWsMessenger implements GameMessenger {

    private handler: MessageHandler | null = null;

    constructor(private readonly ws: WebSocket) {
        ws.addEventListener('message', (raw: MessageEvent) => {
            if (!this.handler) return;
            try {
                this.handler(JSON.parse(raw.data as string), null);
            } catch { /* ignore malformed messages */ }
        });
    }

    send(msg: ServerMessage): void {
        this.ws.send(JSON.stringify(msg));
    }

    /** En single-WS, sendTo == send : un seul écran reçoit tout. */
    sendTo(_color: MarbleColor, msg: ServerMessage): void {
        this.ws.send(JSON.stringify(msg));
    }

    onMessage(handler: MessageHandler): void {
        this.handler = handler;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-device : chaque joueur humain a son propre WebSocket
// ─────────────────────────────────────────────────────────────────────────────

const RECONNECT_WINDOW_MS = 180_000;

export class MultiWsMessenger implements GameMessenger {

    private connections = new Map<MarbleColor, WebSocket>();
    private handler: MessageHandler | null = null;
    private disconnectTimers = new Map<MarbleColor, NodeJS.Timeout>();
    private onPermanentDisconnect: ((color: MarbleColor) => void) | null = null;
    private onTempDisconnect: ((color: MarbleColor) => void) | null = null;
    private onReconnect: ((color: MarbleColor) => void) | null = null;

    /** Register a callback invoked when the 180s reconnection window expires. */
    setOnPermanentDisconnect(cb: (color: MarbleColor) => void): void {
        this.onPermanentDisconnect = cb;
    }

    /** Register a callback invoked immediately when a player's WebSocket closes. */
    setOnTempDisconnect(cb: (color: MarbleColor) => void): void {
        this.onTempDisconnect = cb;
    }

    /** Register a callback invoked when a player successfully reconnects. */
    setOnReconnect(cb: (color: MarbleColor) => void): void {
        this.onReconnect = cb;
    }

    /** Ajoute la connexion d'un joueur humain. */
    addConnection(color: MarbleColor, ws: WebSocket): void {
        this.connections.set(color, ws);
        this.registerCloseHandler(color, ws);

        ws.addEventListener('message', (raw: MessageEvent) => {
            if (!this.handler) return;
            try {
                this.handler(JSON.parse(raw.data as string), color);
            } catch { /* ignore */ }
        });
    }

    /**
     * Rebind a new WebSocket to an existing player slot.
     * Handles three cases:
     *  1. Player disconnected and reconnects within the 180s window (timer pending).
     *  2. Another tab connects while the first is still active (force-replace).
     *  3. The 180s window already expired but `allowExpired` is true — used for
     *     signed-in players, who may rejoin their game at any time while it runs
     *     (the bot has been playing their color in the meantime).
     * Returns true on success, false if no slot is available for reconnection.
     */
    reconnect(color: MarbleColor, ws: WebSocket, allowExpired = false): boolean {
        const timer = this.disconnectTimers.get(color);
        const existing = this.connections.get(color);

        if (timer) {
            // Case 1: reconnecting within the 180s window
            clearTimeout(timer);
            this.disconnectTimers.delete(color);
        } else if (existing) {
            // Case 2: another tab still connected — close old connection
            existing.close(4001, 'Session opened in another tab');
        } else if (!allowExpired) {
            // Window expired and the caller is not entitled to rejoin (guest)
            return false;
        }

        this.connections.set(color, ws);
        this.registerCloseHandler(color, ws);

        ws.addEventListener('message', (raw: MessageEvent) => {
            if (!this.handler) return;
            try {
                this.handler(JSON.parse(raw.data as string), color);
            } catch { /* ignore */ }
        });

        console.log(`🔄 ${color} reconnected`);
        this.onReconnect?.(color);
        return true;
    }

    private registerCloseHandler(color: MarbleColor, ws: WebSocket): void {
        ws.addEventListener('close', (event: CloseEvent) => {
            // Only react if this is still the active socket for this color
            if (this.connections.get(color) !== ws) return;

            // Immediate signal: other players should see the disconnection now,
            // not after the 180s grace period.
            this.onTempDisconnect?.(color);

            // Log the close code/reason to distinguish a backgrounded mobile
            // WebView (1001/1006, heartbeat termination) from an intentional
            // close, so production disconnects can be attributed reliably.
            const reason = event.reason ? ` "${event.reason}"` : '';
            console.log(`⏳ ${color} disconnected (code=${event.code}${reason}) — 180s reconnection window started`);
            const timer = setTimeout(() => {
                this.disconnectTimers.delete(color);
                this.connections.delete(color);
                console.log(`❌ ${color} reconnection window expired — permanently disconnected`);
                this.onPermanentDisconnect?.(color);
            }, RECONNECT_WINDOW_MS);

            this.disconnectTimers.set(color, timer);
        });
    }

    /**
     * Force-disconnect a player: closes their WebSocket and removes them
     * from the connections map without starting the 180s reconnection timer.
     * Used when a player explicitly resigns (abandons) the game.
     */
    forceDisconnect(color: MarbleColor): void {
        const timer = this.disconnectTimers.get(color);
        if (timer) {
            clearTimeout(timer);
            this.disconnectTimers.delete(color);
        }

        const ws = this.connections.get(color);
        // Remove from map first so the close handler won't fire any callbacks
        this.connections.delete(color);
        ws?.close(4002, 'Player abandoned the game');
    }

    /**
     * Tear down the messenger: clear every pending reconnection timer and drop
     * all references. Used when a session is abandoned before the game launches
     * (e.g. matchmaking cancelled because everyone left). Without this, the 180s
     * timers started by `registerCloseHandler` survive on the orphaned messenger
     * and fire a misleading "permanently disconnected" log 3 minutes later.
     */
    dispose(): void {
        for (const timer of this.disconnectTimers.values()) {
            clearTimeout(timer);
        }
        this.disconnectTimers.clear();
        this.connections.clear();
        this.onPermanentDisconnect = null;
        this.onTempDisconnect = null;
        this.onReconnect = null;
    }

    /** Envoie à tous les clients connectés (broadcast). */
    send(msg: ServerMessage): void {
        const json = JSON.stringify(msg);
        for (const ws of this.connections.values()) {
            ws.send(json);
        }
    }

    /** Envoie uniquement au client du joueur `color`. No-op si non connecté. */
    sendTo(color: MarbleColor, msg: ServerMessage): void {
        this.connections.get(color)?.send(JSON.stringify(msg));
    }

    onMessage(handler: MessageHandler): void {
        this.handler = handler;
    }
}
