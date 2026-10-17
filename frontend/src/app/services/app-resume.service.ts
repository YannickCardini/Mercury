import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, filter, take } from 'rxjs';
import { App } from '@capacitor/app';
import { Network, type ConnectionStatus } from '@capacitor/network';
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
    // Clés de reconnexion purgées (partie finie, session expirée…) : le
    // bandeau Resume et les gardes de l'accueil doivent le savoir tout de suite.
    this.gameStateService.activeSessionCleared$.subscribe(() => this.hasActiveGame.set(false));

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

      // Une transition réseau (Wi-Fi→data au verrouillage écran, retour de tunnel…)
      // coupe la socket sans forcément backgrounder l'app. Dès que la connectivité
      // revient, on reconnecte immédiatement la partie en cours.
      // Sur Android, le plugin émet aussi `connected: true` à chaque
      // onCapabilitiesChanged (force du signal, débit estimé…), soit toutes les
      // quelques secondes en 4G ou Wi-Fi faible : seul un vrai retour de la
      // connectivité ou un changement de type de réseau justifie de forcer.
      let lastNetwork: ConnectionStatus | null = null;
      void Network.getStatus().then((status) => { lastNetwork ??= status; });
      void Network.addListener('networkStatusChange', (status) => {
        const previous = lastNetwork;
        lastNetwork = status;
        if (!status.connected || !previous) return;
        if (previous.connected && previous.connectionType === status.connectionType) return;
        if (!this.readActiveGameFromStorage() || this.tabLock.wasReplaced()) return;
        console.log('[AppResume] réseau revenu — reconnexion immédiate');
        // force : la socket survivante est probablement à moitié morte.
        this.gameStateService.reconnectNow(environment.wsUrl, true);
      });
    }
  }

  /**
   * Posé par GamePage quand un chargement échoue sans que la partie soit morte
   * (serveur injoignable, redéploiement) : l'accueil garde la partie et son
   * bandeau Resume, mais n'y renvoie pas automatiquement, pour ne pas boucler
   * accueil ↔ partie tant que le serveur ne répond pas.
   */
  private suppressAutoResume = false;

  suppressNextAutoResume(): void {
    this.suppressAutoResume = true;
  }

  /** Vrai une seule fois après suppressNextAutoResume(). */
  consumeAutoResumeSuppression(): boolean {
    const suppressed = this.suppressAutoResume;
    this.suppressAutoResume = false;
    return suppressed;
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

    // Partie reprise par un autre onglet / appareil (4001) : on ne la lui
    // reprend pas automatiquement, seul le bouton Resume le fait.
    if (this.tabLock.wasReplaced()) {
      console.log('[AppResume] session replaced elsewhere — skipping validation');
      return;
    }

    // Navigateur : une socket encore ouverte n'a rien à revalider (un
    // joinGame dessus serait ignoré par le serveur). Sur mobile, on rouvre
    // quand même plus bas : après l'arrière-plan elle peut être à moitié morte.
    const native = Capacitor.isNativePlatform();
    if (!native && this.gameStateService.isConnected()) {
      this.hasActiveGame.set(true);
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

    // Seule « Session expired » dit que la partie est morte : un rejet de coup
    // (« Not your turn », « Invalid action »…) dans la fenêtre ne doit pas
    // purger une partie bien vivante.
    const rejectedSub = this.gameStateService.actionRejected$.pipe(
      filter(reason => reason === 'Session expired or not found'),
      take(1),
    ).subscribe((reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      startedSub.unsubscribe();
      console.log('[AppResume] server rejected join — game no longer active:', reason);
      this.gameStateService.clearActiveGameSession();
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

    if (!this.gameStateService.isConnected()) {
      // Background suspended the socket — we'll claim the tab lock before the
      // immediate reconnect below.
      this.tabLock.claimSession();
    }
    // Reconnexion immédiate (reset du backoff), sans attendre le rejoinTimer
    // accumulé pendant l'arrière-plan ; forcée sur mobile (voir plus haut).
    console.log('[AppResume] triggering immediate reconnect');
    this.gameStateService.reconnectNow(environment.wsUrl, native);
  }
}
