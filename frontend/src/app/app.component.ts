import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  Router,
  RouterOutlet,
} from "@angular/router";
import { filter, take } from "rxjs";
import { GameStateService } from "./game/services/game-state.service";
import { TabLockService } from "./game/services/tab-lock.service";
import { AppResumeService } from "./services/app-resume.service";
import { AppUpdateService } from "./services/app-update.service";
import { AuthService } from "./services/auth.service";
import { ActiveGameService } from "./services/active-game.service";
import { ToastService } from "./shared/toast.service";
import { UpdateAvailableModalComponent } from "./shared/update-available-modal.component";
import { SpaceBackgroundComponent } from "./shared/space-background.component";
import { LoadingScreenComponent } from "./shared/loading-screen.component";
import { environment } from "../environments/environment";
import { SplashScreen } from "@capacitor/splash-screen";

@Component({
  selector: "app-root",
  templateUrl: "app.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    RouterOutlet,
    UpdateAvailableModalComponent,
    SpaceBackgroundComponent,
    LoadingScreenComponent,
  ],
})
export class AppComponent implements OnInit {
  private gameStateService = inject(GameStateService);
  private tabLock = inject(TabLockService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private activeGame = inject(ActiveGameService);
  /** Eagerly created so its resume listeners are wired for the whole app. */
  protected appResume = inject(AppResumeService);
  protected appUpdate = inject(AppUpdateService);
  protected toast = inject(ToastService);

  /**
   * True until the very first route has finished resolving (cold-start
   * navigation only). Drives a shell-level `<app-loading-screen>` so the
   * bare space background is never exposed before the first route paints.
   *
   * Deliberately scoped to that first navigation only — re-arming it on
   * every subsequent in-app navigation (e.g. Play Now → /game) caused a
   * jarring extra flash: routes like GamePage already own a loading UI
   * synced to real readiness (data + board size), which also times the
   * team-intro-overlay reveal, and layering this generic overlay on top of
   * that carefully-timed sequence broke it instead of smoothing it out.
   */
  protected readonly navigating = signal(true);

  async ngOnInit(): Promise<void> {
    // Ne couvre que le tout premier routage (démarrage à froid) : le splash
    // natif Android (launchAutoHide: false, voir capacitor.config.ts) et
    // l'overlay du shell restent affichés jusqu'à ce que cette première
    // route ait fini de se peindre — sans ça, le splash/overlay disparaît
    // dès la 1re frame du WebView et expose le fond spatial nu pendant le
    // chargement du chunk lazy. Double rAF : laisse le navigateur peindre le
    // DOM déjà mis à jour par NavigationEnd avant de révéler la WebView.
    this.router.events
      .pipe(
        filter(
          (e): e is NavigationEnd | NavigationCancel | NavigationError =>
            e instanceof NavigationEnd ||
            e instanceof NavigationCancel ||
            e instanceof NavigationError
        ),
        take(1)
      )
      .subscribe(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.navigating.set(false);
            SplashScreen.hide().catch(() => {});
          });
        });
      });

    // Vérifie la disponibilité d'une mise à jour au démarrage à froid, puis à
    // chaque reprise de l'app (resumed$ est déjà débouncé côté AppResumeService).
    void this.appUpdate.check();
    this.appResume.resumed$.subscribe(() => void this.appUpdate.check());

    // Handle session replaced by another tab (close code 4001)
    this.gameStateService.sessionReplaced$.subscribe(() => {
      this.toast.show("Game resumed in another tab.");
      this.router.navigate(["/home"]);
    });

    // Handle game abandoned (all human players left)
    this.gameStateService.gameAbandoned$.subscribe(() => {
      this.toast.show(
        "The game was cancelled: no players connected.",
        "error",
        4000
      );
      this.gameStateService.reset();
      this.router.navigate(["/home"]);
    });

    // For signed-in users the server is the source of truth: recover (or
    // invalidate) the local session against it, even if localStorage is empty
    // or stale. Guests keep the pure localStorage-based behaviour unchanged.
    await this.syncSignedInActiveGame();

    const guestPlayerId = localStorage.getItem("guest_player_id");
    const activeGameId = localStorage.getItem("active_game_id");

    if (guestPlayerId && activeGameId) {
      // If another tab already manages this game, don't reconnect
      if (await this.tabLock.isOtherTabActive()) {
        return;
      }

      this.tabLock.claimSession();
      this.gameStateService.connect(environment.wsUrl, () => {
        this.gameStateService.sendJoinGame(guestPlayerId, activeGameId);
      });

      // Listen for gameState (reconnection success) or actionRejected (session expired)
      this.gameStateService.gameStarted$.pipe(take(1)).subscribe(() => {
        this.router.navigate(["/game"]);
      });

      this.gameStateService.actionRejected$
        .pipe(take(1))
        .subscribe((reason) => {
          // Only drop the session when the server explicitly says it's gone —
          // a transient rejection must not strand the player on the home page.
          if (reason === "Session expired or not found") {
            this.gameStateService.clearActiveGameSession();
            this.tabLock.releaseSession();
            this.gameStateService.disconnect();
          }
        });
    }
  }

  /**
   * Reconcile the locally stored game session with the server for signed-in
   * users. On success the reconnection keys are written to (or cleared from)
   * localStorage so the reconnect path below sees the authoritative state.
   * If the server is unreachable, localStorage is left untouched as a fallback.
   */
  private async syncSignedInActiveGame(): Promise<void> {
    if (!this.auth.user$.getValue()) return;
    try {
      const info = await this.activeGame.fetch();
      if (info) {
        localStorage.setItem("guest_player_id", info.guestPlayerId);
        localStorage.setItem("active_game_id", info.gameId);
      } else {
        this.gameStateService.clearActiveGameSession();
      }
    } catch {
      // Server unreachable — keep whatever localStorage already had.
    }
  }
}
