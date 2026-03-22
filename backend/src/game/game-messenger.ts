import type { ClientMessage, MarbleColor } from '@keezen/shared';

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
    send(msg: object): void;
    /** Envoie un message à un joueur spécifique (no-op si non connecté). */
    sendTo(color: MarbleColor, msg: object): void;
    /** Enregistre le handler appelé à chaque message entrant. */
    onMessage(handler: MessageHandler): void;
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

    send(msg: object): void {
        this.ws.send(JSON.stringify(msg));
    }

    /** En single-WS, sendTo == send : un seul écran reçoit tout. */
    sendTo(_color: MarbleColor, msg: object): void {
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

    /** Register a callback invoked when the 180s reconnection window expires. */
    setOnPermanentDisconnect(cb: (color: MarbleColor) => void): void {
        this.onPermanentDisconnect = cb;
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
     * Rebind a new WebSocket to an existing player slot during the reconnection window.
     * Returns true on success, false if no pending disconnect exists for that color.
     */
    reconnect(color: MarbleColor, ws: WebSocket): boolean {
        const timer = this.disconnectTimers.get(color);
        if (!timer) return false;

        clearTimeout(timer);
        this.disconnectTimers.delete(color);

        this.connections.set(color, ws);
        this.registerCloseHandler(color, ws);

        ws.addEventListener('message', (raw: MessageEvent) => {
            if (!this.handler) return;
            try {
                this.handler(JSON.parse(raw.data as string), color);
            } catch { /* ignore */ }
        });

        console.log(`🔄 ${color} reconnected`);
        return true;
    }

    private registerCloseHandler(color: MarbleColor, ws: WebSocket): void {
        ws.addEventListener('close', () => {
            // Only start timer if this is still the active socket for this color
            if (this.connections.get(color) !== ws) return;

            console.log(`⏳ ${color} disconnected — 180s reconnection window started`);
            const timer = setTimeout(() => {
                this.disconnectTimers.delete(color);
                this.connections.delete(color);
                console.log(`❌ ${color} reconnection window expired — permanently disconnected`);
                this.onPermanentDisconnect?.(color);
            }, RECONNECT_WINDOW_MS);

            this.disconnectTimers.set(color, timer);
        });
    }

    /** Envoie à tous les clients connectés (broadcast). */
    send(msg: object): void {
        const json = JSON.stringify(msg);
        for (const ws of this.connections.values()) {
            ws.send(json);
        }
    }

    /** Envoie uniquement au client du joueur `color`. No-op si non connecté. */
    sendTo(color: MarbleColor, msg: object): void {
        this.connections.get(color)?.send(JSON.stringify(msg));
    }

    onMessage(handler: MessageHandler): void {
        this.handler = handler;
    }
}
