import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import type {
  GameInviteMessage,
  GameInviteResponseMessage,
  GameInviteCancelledMessage,
  ServerMessage,
} from '@mercury/shared';

/**
 * Maintains a "presence" WebSocket for a signed-in user idle on the home page.
 * The server uses it to push real-time `gameInvite` notifications and to relay
 * decline responses back to inviters.
 *
 * The presence socket is short-lived: it is torn down whenever another flow
 * (matchmaking, custom room, in-game) opens its own WS connection, since a
 * single tab keeps a single active socket.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {

  /** Pushed when the server forwards an invite from another user. */
  gameInvite$ = new Subject<GameInviteMessage>();
  /** Pushed when the server forwards a decline from a previously invited user. */
  gameInviteResponse$ = new Subject<GameInviteResponseMessage>();
  /** Pushed when the server cancels a previously-sent invite (room closed, expired, …). */
  gameInviteCancelled$ = new Subject<GameInviteCancelledMessage>();

  private ws: WebSocket | null = null;
  private currentUserId: string | null = null;
  private currentUrl: string | null = null;
  private intentionalDisconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 30_000;

  connect(url: string, userId: string): void {
    if (this.ws && this.currentUserId === userId) return;
    this.disconnect();

    this.intentionalDisconnect = false;
    this.currentUserId = userId;
    this.currentUrl = url;
    this.openSocket();
  }

  private openSocket(): void {
    const url = this.currentUrl;
    const userId = this.currentUserId;
    if (!url || !userId) return;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelayMs = 1000;
      try { ws.send(JSON.stringify({ type: 'registerPresence', userId })); } catch { /* ignore */ }
    };
    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as ServerMessage;
        if (parsed.type === 'gameInvite') {
          this.gameInvite$.next(parsed);
        } else if (parsed.type === 'gameInviteResponse') {
          this.gameInviteResponse$.next(parsed);
        } else if (parsed.type === 'gameInviteCancelled') {
          this.gameInviteCancelled$.next(parsed);
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => { /* surface only via close */ };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.intentionalDisconnect) {
        this.currentUserId = null;
        this.currentUrl = null;
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  /** Sends the user's response to an invite. accepted=true is mainly used for telemetry; the actual join happens through the custom-room flow. */
  respondToInvite(fromUserId: string, accepted: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ type: 'inviteResponse', fromUserId, accepted }));
    } catch { /* ignore */ }
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectDelayMs = 1000;
    if (!this.ws) {
      this.currentUserId = null;
      this.currentUrl = null;
      return;
    }
    const ws = this.ws;
    this.ws = null;
    this.currentUserId = null;
    this.currentUrl = null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try { ws.close(); } catch { /* ignore */ }
  }
}
