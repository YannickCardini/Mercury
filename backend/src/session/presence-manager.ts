// ─────────────────────────────────────────────────────────────────────────────
// PresenceManager — registre des sockets actifs par userId.
//
// Permet au serveur de pousser des notifications (ex: invitations à une partie
// custom) à un utilisateur connecté quel que soit son état (idle sur la home,
// dans une custom room, en matchmaking, …). Un même userId peut avoir plusieurs
// sockets ouverts (multi-onglet) — la notif est diffusée à tous.
// ─────────────────────────────────────────────────────────────────────────────

interface PendingEntry {
    msg: object;
    timer: NodeJS.Timeout;
    onFail: () => void;
}

export class PresenceManager {

    private byUserId = new Map<string, Set<WebSocket>>();
    private byWs = new Map<WebSocket, string>();
    private pending = new Map<string, PendingEntry[]>();

    register(userId: string, ws: WebSocket): void {
        const existing = this.byWs.get(ws);
        if (existing === userId) return;
        if (existing) this.unregister(ws);

        let set = this.byUserId.get(userId);
        if (!set) {
            set = new Set();
            this.byUserId.set(userId, set);
        }
        set.add(ws);
        this.byWs.set(ws, userId);

        // Flush any messages that were queued while this user was unregistered.
        const queue = this.pending.get(userId);
        if (queue) {
            this.pending.delete(userId);
            for (const entry of queue) {
                clearTimeout(entry.timer);
                try { ws.send(JSON.stringify(entry.msg)); } catch { /* ignore */ }
            }
        }
    }

    unregister(ws: WebSocket): void {
        const userId = this.byWs.get(ws);
        if (!userId) return;
        const set = this.byUserId.get(userId);
        if (set) {
            set.delete(ws);
            if (set.size === 0) this.byUserId.delete(userId);
        }
        this.byWs.delete(ws);
    }

    /**
     * Attempts immediate delivery. If the user has no registered socket,
     * queues the message for up to `ttlMs` milliseconds and calls `onFail`
     * if the user never connects within that window. Returns true if
     * delivered immediately, false if queued or dropped.
     */
    sendOrQueue(userId: string, msg: object, ttlMs: number, onFail: () => void): boolean {
        if (this.send(userId, msg)) return true;

        let queue = this.pending.get(userId);
        if (!queue) {
            queue = [];
            this.pending.set(userId, queue);
        }

        // Use a placeholder then overwrite so the closure can reference `entry`.
        const entry = {} as PendingEntry;
        entry.msg = msg;
        entry.onFail = onFail;
        entry.timer = setTimeout(() => {
            const q = this.pending.get(userId);
            if (q) {
                const idx = q.indexOf(entry);
                if (idx !== -1) q.splice(idx, 1);
                if (q.length === 0) this.pending.delete(userId);
            }
            onFail();
        }, ttlMs);
        queue.push(entry);
        return false;
    }

    /**
     * Retire de la file in-memory toutes les entrées de `userId` matchant
     * `filter`, et clear leurs timers. Utilisé pour révoquer une invitation
     * queued quand la room source est détruite avant que l'invité revienne
     * en ligne.
     */
    cancelQueued(userId: string, filter: (msg: object) => boolean): void {
        const queue = this.pending.get(userId);
        if (!queue) return;
        for (let i = queue.length - 1; i >= 0; i--) {
            const entry = queue[i]!;
            if (filter(entry.msg)) {
                clearTimeout(entry.timer);
                queue.splice(i, 1);
            }
        }
        if (queue.length === 0) this.pending.delete(userId);
    }

    /** Returns true if the message was delivered to at least one socket. */
    send(userId: string, msg: object): boolean {
        const set = this.byUserId.get(userId);
        if (!set || set.size === 0) return false;
        const json = JSON.stringify(msg);
        let sent = false;
        for (const ws of set) {
            try {
                ws.send(json);
                sent = true;
            } catch { /* ignore */ }
        }
        return sent;
    }
}
