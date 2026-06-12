import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, take } from 'rxjs';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { GameStateService } from '../game/services/game-state.service';
import { TabLockService } from '../game/services/tab-lock.service';
import { environment } from '../../environments/environment';

/** Ignore resume events that arrive within this window of the previous one. */
const RESUME_DEBOUNCE_MS = 1000;
/** Give up waiting for the server's join response after this long. */
const VALIDATION_TIMEOUT_MS = 8000;

/**
 * Single, app-wide owner of the "app became visible / regained focus" signal.
 *
 * On every resume it re-validates the active game stored in localStorage
 * against the server: a stale `active_game_id` (e.g. left overnight) gets
 * cleared, and a still-live game gets its state refreshed. While the check
 * is in flight, `validating()` is true so a full-screen loader can be shown.
 *
 * Instantiated once (eagerly, from AppComponent) — never wire resume
 * listeners per-page.
 */
@Injectable({ providedIn: 'root' })
export class AppResumeService {

  private gameStateService = inject(GameStateService);
  private tabLock = inject(TabLockService);
  private router = inject(Router);

  /** Emits whenever the app transitions from background → foreground. */
  readonly resumed$ = new Subject<void>();

  /** True while the active game is being re-validated against the server. */
  readonly validating = signal(false);

  /** True when a server-confirmed (or not-yet-checked) active game exists. */
  readonly hasActiveGame = signal(this.readActiveGameFromStorage());

  /** Set whenever the app goes to the background; gates the resume handler. */
  private wasBackgrounded = false;
  private lastResumeAt = 0;

  /**
   * True while the app is in the background. Other features can use this to
   * decide whether a WebSocket close was the result of the OS suspending the
   * tab (don't show an error UI; reconnect on resume) vs a real network drop.
   */
  isBackgrounded(): boolean {
    return this.wasBackgrounded;
  }

  /**
   * True if the app came back from background within the last `withinMs`.
   * Useful right after a `connectionError$` fires to attribute the close to
   * the background period that just ended.
   */
  resumedRecently(withinMs = 4000): boolean {
    return this.lastResumeAt > 0 && (Date.now() - this.lastResumeAt) < withinMs;
  }

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.onPotentialResume('visibilitychange');
      } else {
        this.wasBackgrounded = true;
      }
    });

    window.addEventListener('focus', () => this.onPotentialResume('focus'));
    window.addEventListener('blur', () => { this.wasBackgrounded = true; });

    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          this.onPotentialResume('appStateChange');
        } else {
          this.wasBackgrounded = true;
        }
      });
    }
  }

  /** Re-sync `hasActiveGame` from localStorage (call when landing on /home). */
  refreshFromStorage(): void {
    this.hasActiveGame.set(this.readActiveGameFromStorage());
  }

  private readActiveGameFromStorage(): boolean {
    return !!(localStorage.getItem('active_game_id') && localStorage.getItem('guest_player_id'));
  }

  private onPotentialResume(source: string): void {
    // Only react to a genuine background → foreground transition, and
    // collapse the burst of events (visibilitychange + focus + appStateChange)
    // that fire together into a single resume.
    if (!this.wasBackgrounded) return;
    const now = Date.now();
    if (now - this.lastResumeAt < RESUME_DEBOUNCE_MS) return;
    this.lastResumeAt = now;
    this.wasBackgrounded = false;

    console.log(`[AppResume] app resumed (via ${source})`);
    this.resumed$.next();
    void this.validateActiveGame();
  }

  private async validateActiveGame(): Promise<void> {
    const guestPlayerId = localStorage.getItem('guest_player_id');
    const activeGameId = localStorage.getItem('active_game_id');

    if (!guestPlayerId || !activeGameId) {
      console.log('[AppResume] no active game in storage — nothing to validate');
      this.hasActiveGame.set(false);
      return;
    }

    // Another tab owns the live socket — let it manage the game, don't fight
    // it for the connection or the tab lock.
    if (await this.tabLock.isOtherTabActive()) {
      console.log('[AppResume] another tab owns the session — skipping validation');
      return;
    }

    console.log('[AppResume] validating active game with server', { activeGameId });
    this.validating.set(true);

    let settled = false;
    const startedSub = this.gameStateService.gameStarted$.pipe(take(1)).subscribe(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      rejectedSub.unsubscribe();
      console.log('[AppResume] server confirmed active game — state refreshed');
      this.hasActiveGame.set(true);
      this.validating.set(false);
      void this.router.navigate(['/game']);
    });

    const rejectedSub = this.gameStateService.actionRejected$.pipe(take(1)).subscribe((reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      startedSub.unsubscribe();
      console.log('[AppResume] server rejected join — game no longer active:', reason);
      localStorage.removeItem('active_game_id');
      localStorage.removeItem('guest_player_id');
      this.tabLock.releaseSession();
      this.gameStateService.reset();
      this.hasActiveGame.set(false);
      this.validating.set(false);
    });

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      startedSub.unsubscribe();
      rejectedSub.unsubscribe();
      console.warn('[AppResume] validation timed out — leaving stored game unchanged');
      this.validating.set(false);
    }, VALIDATION_TIMEOUT_MS);

    if (this.gameStateService.isConnected()) {
      // Socket survived the background — just ask for a fresh state.
      console.log('[AppResume] socket still alive — re-issuing joinGame to refresh state');
      this.gameStateService.sendJoinGame(guestPlayerId, activeGameId);
    } else {
      // Background suspended the socket — reconnect, then re-join.
      console.log('[AppResume] socket is down — reconnecting before joinGame');
      this.tabLock.claimSession();
      this.gameStateService.connect(environment.wsUrl, () => {
        this.gameStateService.sendJoinGame(guestPlayerId, activeGameId);
      });
    }
  }
}
