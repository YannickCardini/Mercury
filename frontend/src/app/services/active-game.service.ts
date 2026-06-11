import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { MarbleColor } from '@mercury/shared';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

export interface ActiveGameInfo {
  gameId: string;
  guestPlayerId: string;
  color: MarbleColor;
}

/**
 * Server-authoritative reconnection lookup for signed-in users. The server,
 * not localStorage, is the source of truth about whether the account is
 * currently a player in a running game — this recovers a wiped/stale local
 * session so the existing `joinGame` reconnect path can be reused.
 */
@Injectable({ providedIn: 'root' })
export class ActiveGameService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  /**
   * Returns the running game tied to the signed-in account, or null when not
   * signed in or not in a game. Throws on network/HTTP error so callers can
   * tell "no active game" (null) apart from "couldn't reach the server".
   */
  async fetch(): Promise<ActiveGameInfo | null> {
    const token = await this.auth.getFreshIdToken();
    if (!token) return null;
    const res = await firstValueFrom(
      this.http.get<ActiveGameInfo | null>(`${environment.apiUrl}/api/active-game`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    return res ?? null;
  }
}
