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

export class MultiWsMessenger implements GameMessenger {

    private connections = new Map<MarbleColor, WebSocket>();
    private handler: MessageHandler | null = null;

    /** Ajoute la connexion d'un joueur humain. */
    addConnection(color: MarbleColor, ws: WebSocket): void {
        this.connections.set(color, ws);

        ws.addEventListener('message', (raw: MessageEvent) => {
            if (!this.handler) return;
            try {
                this.handler(JSON.parse(raw.data as string), color);
            } catch { /* ignore */ }
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
