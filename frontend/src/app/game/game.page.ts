import {
  Component,
  signal,
  computed,
  effect,
  viewChild,
  OnDestroy,
  AfterViewInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Router } from "@angular/router";
import { BoardComponent } from "./components/board/board.component";
import { TableComponent } from "./components/table/table.component";
import { VictoryOverlayComponent, type VictoryPlayer } from "./components/victory-overlay/victory-overlay.component";
import { TeamIntroOverlayComponent, type TeamIntroPlayer } from "./components/team-intro-overlay/team-intro-overlay.component";
import { TutorialOverlayComponent } from "./components/tutorial-overlay/tutorial-overlay.component";
import { GameRulesModalComponent } from "../shared/game-rules-modal.component";
import { LoadingScreenComponent } from "../shared/loading-screen.component";
import { GameStateService } from "./services/game-state.service";
import { SoundService } from "./services/sound.service";
import { ToastService } from "../shared/toast.service";
import { environment } from "../../environments/environment";
import { Subscription } from "rxjs";
import { ARRIVAL_POSITIONS, NEW_TURN_BANNER_DURATION_MS, TEAMS } from "@mercury/shared";
import type { MarbleColor } from "@mercury/shared";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";

/** How long the load-failure message stays on the loading screen before redirecting home. */
const LOAD_ERROR_REDIRECT_MS = 3000;

/** Tampon avant de démarrer l'annonce d'équipe, aligné sur le fondu CSS du
 * spinner (loading-screen.component.scss, 0.25s) : laisse le glissement des
 * bandeaux, très ease-out, déjà bien entamé au moment où le spinner a fini
 * de s'effacer, au lieu de le voir glisser depuis le bord à découvert. */
const ANNOUNCE_START_BUFFER_MS = 300;
/** Borne du préchargement des avatars d'équipe avant de lancer l'annonce —
 * une URL lente/cassée ne doit jamais bloquer la transition. */
const AVATAR_PRELOAD_TIMEOUT_MS = 700;
/** Durée de l'animation d'entrée du masque (bandeaux + flash + VS) — doit
 * rester synchronisée avec $slide-duration/$flash-delay/$vs-delay dans
 * team-intro-overlay.component.scss (le pop VS, le plus tardif, se termine
 * à 0.85s + 0.55s = 1.4s). Board/table ne sont montés derrière le masque
 * qu'une fois ce délai écoulé, quand plus rien n'anime à l'écran. */
const ENTRANCE_SETTLE_MS = 1400;

@Component({
  selector: "app-game",
  templateUrl: "game.page.html",
  styleUrl: "game.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BoardComponent,
    TableComponent,
    VictoryOverlayComponent,
    TeamIntroOverlayComponent,
    TutorialOverlayComponent,
    GameRulesModalComponent,
    LoadingScreenComponent,
  ],
  // `is-native` : allège en CSS les effets coûteux (backdrop-filter) sur
  // WebView Android. Le rendu web/desktop reste inchangé.
  host: { "[class.is-native]": "isNative" },
})
export class GamePage implements OnDestroy, AfterViewInit {
  readonly isNative = Capacitor.isNativePlatform();
  readonly debug = environment.debug;
  showNewTurnBanner = signal(false);
  showRules = signal(false);
  newTurnColor = signal<string>("");
  newTurnName = signal<string>("");
  newTurnPicture = signal<string | null>(null);
  /** Vrai quand la bannière du tour courant doit afficher la variante « Tour Bonus · Joker ». */
  isReplayBanner = signal(false);

  /**
   * Error message shown on the loading screen when the game fails to
   * load/reconnect (e.g. "Session expired or not found"). When set, the page
   * briefly displays it then redirects home — instead of hanging forever on
   * "Connecting to the server...".
   */
  loadError = signal<string | null>(null);
  boardReady = signal(false);
  /** Vrai une fois qu'un vrai paint navigateur a été confirmé après
   * boardReady() (qui se déclenche depuis un afterNextRender dans
   * BoardComponent, donc AVANT le paint réel) — condition nécessaire avant
   * de laisser l'annonce d'équipe se rétracter. */
  boardPainted = signal(false);

  /** Machine à états du chargement : spinner → (annonce d'équipe plein
   * écran, 2v2 uniquement) → partie révélée. Remplace l'ancien gate
   * implicite data()+boardReady() : tant que la phase reste 'loading', ni
   * l'annonce ni board/table (coûteux, ~2000+ nœuds DOM) ne sont montés. */
  phase = signal<"loading" | "announcing" | "revealed">("loading");
  /** Vrai une fois l'animation d'entrée du masque (bandeaux + flash + VS)
   * entièrement terminée — c'est seulement à partir de là que board/table
   * peuvent être montés derrière le masque désormais figé, sans risque de
   * saccade visible pendant le montage. */
  private entranceSettled = signal(false);
  /** Vrai pour un vrai démarrage de partie 2v2 (annonce nécessaire) — faux
   * pour les autres modes ou une reconnexion mi-partie (comportement
   * identique à aujourd'hui : spinner jusqu'à boardReady(), pas d'annonce). */
  private needsAnnounce = computed(
    () =>
      this.gameStateService.gameMode() === "2v2" &&
      this.gameStateService.data()?.message !== "Reconnected"
  );
  /** Pilote le montage d'app-board/app-table. */
  mountBoard = computed(() => {
    switch (this.phase()) {
      case "revealed":
        return true;
      case "announcing":
        return this.entranceSettled();
      case "loading":
        return !!this.gameStateService.data() && !this.needsAnnounce();
    }
  });

  /** Status line for the initial-load loading screen. */
  loadingStatus = computed(() => {
    const err = this.loadError();
    if (err) return err;
    return this.gameStateService.isConnected()
      ? "Initializing game data..."
      : "Connecting to the server...";
  });

  /** Gagnant(s) avec avatar et pions rentrés : un en 1v3, les deux coéquipiers en 2v2. */
  winnersInfo = computed<VictoryPlayer[]>(() => {
    // Le serveur passe de `actionPlayed` (animation du coup gagnant, qui ne
    // touche que la copie locale du board) directement à `gameEnded`, sans
    // renvoyer un `gameState` avec la position finale : `data()` peut donc ne
    // pas encore refléter le dernier pion rentré. Sur une VRAIE victoire (pas
    // un forfait), la règle du jeu garantit que les 2 coéquipiers ont leurs 4
    // pions à l'arrivée — on l'affiche donc sans dépendre de ce timing.
    const realWin = this.gameStateService.winReason() === 'win';
    return this.gameStateService.winners().map((color) => this.victoryPlayer(color, realWin));
  });

  /** Perdant(s), dans l'ordre des sièges : trois en 1v3, les deux coéquipiers adverses en 2v2. */
  losersInfo = computed<VictoryPlayer[]>(() => {
    const winners = this.gameStateService.winners();
    if (winners.length === 0) return [];
    const players = this.gameStateService.data()?.gameState.players ?? [];
    return players
      .filter((p) => !winners.includes(p.color))
      .map((p) => this.victoryPlayer(p.color, false));
  });

  /** Projette un joueur de la partie vers sa carte de l'écran de fin. */
  private victoryPlayer(color: MarbleColor, forceFullArrival: boolean): VictoryPlayer {
    const player = this.gameStateService
      .data()
      ?.gameState.players.find((p) => p.color === color);
    const arrivals = ARRIVAL_POSITIONS[color];
    return {
      color,
      name: player?.name ?? color,
      ...(player?.picture ? { picture: player.picture } : {}),
      isMe: color === this.gameStateService.myPlayerColor(),
      arrivalCount: forceFullArrival
        ? 4
        : player?.marblePositions.filter((pos) => arrivals.includes(pos)).length ?? 0,
    };
  }

  /** Vrai si le joueur local fait partie des gagnants (spectateur → vue neutre gagnante). */
  isLocalWinner = computed(() => {
    const myColor = this.gameStateService.myPlayerColor();
    return myColor === null || this.gameStateService.winners().includes(myColor);
  });

  // ── Annonce des équipes (2v2) ────────────────────────────────────

  private teamIntro = viewChild(TeamIntroOverlayComponent);
  /** Accès au plateau pour le mode édition debug (pause + édition + reprise). */
  private boardCmp = viewChild(BoardComponent);
  /** Vrai une fois le préchargement des avatars lancé (garde de ré-entrance). */
  private avatarsPreloading = false;
  /** Vrai une fois intro.play() appelé pour cette annonce (garde de ré-entrance). */
  private introStarted = false;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private entranceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Équipe de la bande du HAUT de l'annonce (red+blue, avatars losange). */
  introTopTeam = computed<TeamIntroPlayer[]>(() => TEAMS[0].map((c) => this.introPlayer(c)));
  /** Équipe de la bande du BAS de l'annonce (green+orange, avatars ronds). */
  introBottomTeam = computed<TeamIntroPlayer[]>(() => TEAMS[1].map((c) => this.introPlayer(c)));

  private introPlayer(color: MarbleColor): TeamIntroPlayer {
    const player = this.gameStateService
      .data()
      ?.gameState.players.find((p) => p.color === color);
    return {
      color,
      name: player?.name ?? color,
      ...(player?.picture ? { picture: player.picture } : {}),
    };
  }

  /**
   * Précharge/décode les avatars d'équipe pendant que le spinner est encore
   * affiché, pour que l'annonce n'ait pas à attendre un décodage d'image une
   * fois déjà en train d'animer. Ne bloque jamais plus de
   * AVATAR_PRELOAD_TIMEOUT_MS, même si une URL est lente ou cassée.
   */
  private preloadAvatars(): Promise<void> {
    const urls = [...this.introTopTeam(), ...this.introBottomTeam()]
      .map((p) => p.picture)
      .filter((url): url is string => !!url);
    if (urls.length === 0) return Promise.resolve();
    const loaders = urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.referrerPolicy = "no-referrer";
          img.src = url;
          img.decode().then(
            () => resolve(),
            () => resolve() // URL cassée/lente : ne bloque jamais la transition
          );
        })
    );
    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, AVATAR_PRELOAD_TIMEOUT_MS)
    );
    return Promise.race([Promise.all(loaders).then(() => undefined), timeout]);
  }

  /** True when the local player has no userId (guest / not signed in). */
  isLocalPlayerGuest = computed(() => {
    const color = this.gameStateService.myPlayerColor();
    if (!color) return true;
    const player = this.gameStateService
      .data()
      ?.gameState.players.find((p) => p.color === color);
    return !player?.userId;
  });

  private newTurnTimeout: ReturnType<typeof setTimeout> | null = null;
  private newTurnSub: Subscription | null = null;

  /** Subscriptions that detect a failed reconnection / game start while loading. */
  private loadFailSubs: Subscription[] = [];
  /** Subscriptions du feedback en jeu (rejets serveur, reconnexion). */
  private uiSubs: Subscription[] = [];
  /** Pending redirect-to-home timer shown after a load-failure message. */
  private loadFailRedirect: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public gameStateService: GameStateService,
    private soundService: SoundService,
    private router: Router,
    private toast: ToastService
  ) {
    effect(() => {
      const winners = this.gameStateService.winners();
      if (winners.length === 0) return;
      const myColor = this.gameStateService.myPlayerColor();
      if (myColor !== null && winners.includes(myColor)) {
        this.soundService.playVictory();
      } else {
        this.soundService.playDefeat();
      }
    });

    // Transition hors du spinner : soit vers l'annonce d'équipe plein écran
    // (vrai démarrage 2v2 — précharge les avatars, laisse le fondu du
    // spinner s'entamer, puis passe en 'announcing'), soit directement vers
    // la partie révélée (autres modes, ou reconnexion mi-partie —
    // comportement identique à avant : spinner jusqu'à boardReady()).
    effect(() => {
      if (this.phase() !== "loading") return;
      const data = this.gameStateService.data();
      if (!data) return;

      if (!this.needsAnnounce()) {
        if (!this.boardReady()) return;
        this.phase.set("revealed");
        return;
      }

      if (this.avatarsPreloading) return;
      this.avatarsPreloading = true;
      this.preloadAvatars().finally(() => {
        if (this.phase() !== "loading") return;
        // Attend la fin du fondu de sortie de l'écran de chargement
        // (transition CSS de 0.25s, voir loading-screen.component.scss)
        // avant de lancer l'annonce : son glissement (cubic-bezier très
        // ease-out, cf. team-intro-overlay.component.scss) est presque
        // entièrement joué dès les premières ~250ms, donc le démarrer
        // PENDANT le fondu le fait apparaître déjà en place ("pop") au lieu
        // de le voir glisser depuis le bord une fois l'écran de chargement
        // effacé.
        this.announceTimer = setTimeout(() => {
          if (this.phase() !== "loading") return;
          // L'annonce occupe le plateau : on masque la bannière de tour qui
          // aurait pu s'afficher pour le premier tour (pas de superposition).
          this.showNewTurnBanner.set(false);
          this.phase.set("announcing");
        }, ANNOUNCE_START_BUFFER_MS);
      });
    });

    // Entrée/sortie de l'annonce : démarre l'animation d'entrée, attend
    // qu'elle soit ENTIÈREMENT figée (ENTRANCE_SETTLE_MS) avant de laisser
    // mountBoard() monter board/table derrière le masque désormais statique
    // — c'est le pic de ~3400 nœuds DOM, mais rien n'anime pendant qu'il a
    // lieu, donc rien ne peut visuellement saccader. Repasse en 'revealed'
    // une fois que l'overlay a fini de se rétracter (intro.playing()
    // redevient faux — déclenché par le composant lui-même une fois
    // boardPainted() et son plancher d'affichage tous deux vrais, voir
    // team-intro-overlay.component.ts).
    effect(() => {
      if (this.phase() !== "announcing") return;
      const intro = this.teamIntro();
      if (!intro) return;

      if (!this.introStarted) {
        this.introStarted = true;
        this.gameStateService.teamIntroPlaying.set(true);
        if (!this.debug)
          intro.play();
        this.entranceTimer = setTimeout(
          () => this.entranceSettled.set(true),
          ENTRANCE_SETTLE_MS
        );
        return;
      }
      if (intro.playing()) return; // toujours affichée / en train de se rétracter
      this.phase.set("revealed");
      this.gameStateService.teamIntroPlaying.set(false);
      this.introStarted = false;
      this.entranceSettled.set(false);
    });

    // Confirme un vrai paint navigateur après boardReady() (qui se déclenche
    // depuis un afterNextRender dans BoardComponent, donc AVANT le paint) —
    // condition nécessaire avant de laisser l'annonce se rétracter.
    effect(() => {
      if (!this.boardReady()) return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.boardPainted.set(true))
      );
    });

    // Empêche l'écran de se verrouiller pendant SON tour : sur Android le
    // verrouillage coupe le Wi-Fi (→ socket morte) au pire moment. On relâche
    // dès que le tour passe à un adversaire pour ne pas vider la batterie.
    if (Capacitor.isNativePlatform()) {
      effect(() => {
        if (this.gameStateService.isMyTurn()) {
          void KeepAwake.keepAwake().catch(() => { /* ignore */ });
        } else {
          void KeepAwake.allowSleep().catch(() => { /* ignore */ });
        }
      });
    }

    // ✅ Subscription RxJS propre — réactive à chaque next() du BehaviorSubject,
    // contrairement à .value qui est un snapshot lu une seule fois au moment
    // de l'exécution de l'effect.
    this.newTurnSub = this.gameStateService.newTurn.subscribe(() => {
      const gameData = this.gameStateService.data();
      if (!gameData) return;

      const currentTurn = gameData.gameState?.currentTurn;
      if (!currentTurn) return;

      const player = gameData.gameState.players.find(
        (p) => p.color === currentTurn
      );
      // Un joueur qui a fini ses 4 pions (2v2) est annoncé avec la couleur de
      // son coéquipier : c'est pour lui qu'il joue ce tour.
      this.newTurnColor.set(this.gameStateService.displayColor(currentTurn));
      this.newTurnName.set(player?.name ?? currentTurn);
      this.newTurnPicture.set(player?.picture ?? null);
      this.isReplayBanner.set(this.gameStateService.isReplayTurn());
      // Pas de bannière de tour pendant l'annonce des équipes (2v2) : les
      // deux occupent le plateau et se superposeraient.
      if (this.phase() === "announcing") return;
      if (player?.cardsLeft && player.cardsLeft > 0) {
        this.showNewTurnBanner.set(true);
        if (this.gameStateService.isMyTurn()) {
          this.soundService.playNewTurn();
          if (
            Capacitor.isNativePlatform() &&
            this.soundService.vibrationEnabled()
          ) {
            Haptics.impact({ style: ImpactStyle.Medium });
          }
        }
      }

      if (this.newTurnTimeout) clearTimeout(this.newTurnTimeout);
      this.newTurnTimeout = setTimeout(() => {
        this.showNewTurnBanner.set(false);
        this.newTurnPicture.set(null);
      }, NEW_TURN_BANNER_DURATION_MS);
    });

    // Reconnection / game-start failures: surface the reason and return home
    // instead of hanging forever on the "Connecting…" loading screen.
    this.loadFailSubs.push(
      this.gameStateService.actionRejected$.subscribe((reason) =>
        this.handleLoadFailure(reason)
      ),
      this.gameStateService.connectionError$.subscribe(() =>
        this.handleLoadFailure("Could not connect to the game.")
      )
    );

    // Feedback en jeu : rejets serveur (coup invalide, session expirée…) et
    // reconnexion automatique après une coupure réseau.
    this.uiSubs.push(
      this.gameStateService.actionRejected$.subscribe((reason) =>
        this.handleInGameRejection(reason)
      ),
      this.gameStateService.reconnecting$.subscribe(() =>
        this.toast.show("Connection lost — reconnecting…", "error")
      ),
      this.gameStateService.reconnected$.subscribe(() =>
        this.toast.show("Reconnected", "info", 1500)
      )
    );
  }

  /**
   * Pendant la partie (data() non null), un rejet serveur doit être visible :
   * sans feedback le joueur voit juste sa carte se désélectionner. Le cas
   * « Session expired » (partie morte côté serveur après une reconnexion
   * automatique) est fatal : on purge la session et on rentre au menu.
   */
  private handleInGameRejection(reason: string): void {
    if (this.gameStateService.data() === null) return; // phase de chargement → handleLoadFailure
    if (reason === "Session expired or not found") {
      this.toast.show("The game has ended or no longer exists.", "error", 4000);
      this.backToMenu();
      return;
    }
    this.toast.show(this.rejectionLabel(reason), "error");
  }

  private rejectionLabel(reason: string): string {
    switch (reason) {
      case "Not your turn":
        return "It's not your turn.";
      case "Invalid action":
        return "Move not allowed.";
      default:
        return reason || "Action rejected by the server.";
    }
  }

  backToMenu(): void {
    this.gameStateService.clearActiveGameSession();
    this.gameStateService.reset();
    void this.router.navigate(["/home"]);
  }

  /**
   * Debug only: toggle the board edit mode. First click pauses the game
   * server-side and lets you freely move every marble on the board; second
   * click sends the edited board as the new authoritative state and resumes.
   */
  debugToggleBoardEdit(): void {
    const board = this.boardCmp();
    if (!board) return;
    if (this.gameStateService.boardEditMode()) board.exitEditMode();
    else board.enterEditMode();
  }

  /** Debug only: preview the victory overlay without playing a full game. */
  debugShowVictory(): void {
    this.debugForceGameEnd(true);
  }

  /** Debug only: preview the defeat overlay without playing a full game. */
  debugShowDefeat(): void {
    this.debugForceGameEnd(false);
  }

  /** Fakes a `winners` result so the real victory/defeat overlay renders as-is. */
  private debugForceGameEnd(iWin: boolean): void {
    const players = this.gameStateService.data()?.gameState.players ?? [];
    if (players.length === 0) return;
    const myColor = this.gameStateService.myPlayerColor();
    const fallback = players[0]!.color;
    let winners: MarbleColor[];
    if (this.gameStateService.gameMode() === "2v2") {
      const myTeam = TEAMS.find((team) => !!myColor && team.includes(myColor)) ?? TEAMS[0];
      const otherTeam = myTeam === TEAMS[0] ? TEAMS[1] : TEAMS[0];
      winners = [...(iWin ? myTeam : otherTeam)];
    } else {
      winners = [iWin ? (myColor ?? fallback) : (players.find((p) => p.color !== myColor)?.color ?? fallback)];
    }
    this.gameStateService.winners.set(winners);
    this.gameStateService.winReason.set("win");
  }

  ngOnDestroy(): void {
    // Évite les memory leaks — toujours se désabonner manuellement
    this.newTurnSub?.unsubscribe();
    this.loadFailSubs.forEach((sub) => sub.unsubscribe());
    this.uiSubs.forEach((sub) => sub.unsubscribe());
    if (this.newTurnTimeout) clearTimeout(this.newTurnTimeout);
    if (this.loadFailRedirect) clearTimeout(this.loadFailRedirect);
    if (this.announceTimer) clearTimeout(this.announceTimer);
    if (this.entranceTimer) clearTimeout(this.entranceTimer);
    // Évite de laisser le flag partagé bloqué à true si la page est détruite
    // pendant l'annonce (ex. navigation arrière) sans passer par reset().
    this.gameStateService.teamIntroPlaying.set(false);
    // Quitter la partie : on relâche le verrou écran.
    if (Capacitor.isNativePlatform()) {
      void KeepAwake.allowSleep().catch(() => { /* ignore */ });
    }
  }

  ngAfterViewInit(): void {
    if (!this.gameStateService.isConnected()) {
      this.connect();
    }
  }

  connect(): void {
    this.gameStateService.connect(environment.wsUrl, () => {
      const activeGameId = localStorage.getItem("active_game_id");
      const guestPlayerId = localStorage.getItem("guest_player_id");
      if (activeGameId && guestPlayerId) {
        this.gameStateService.sendJoinGame(guestPlayerId, activeGameId);
      } else {
        this.handleLoadFailure("No active game session.");
      }
    });
  }

  disconnect(): void {
    this.gameStateService.disconnect();
  }

  /**
   * Called when the WebSocket rejects our join or the connection fails before
   * any game data arrives — i.e. while the loading screen is still showing
   * (gameStateService.data() === null). An in-game rejection (illegal move)
   * arrives only once data is loaded, so it is ignored here.
   *
   * Shows the reason on the loading screen, drops the stale session so the
   * next load won't loop on the same failure, then returns to /home.
   */
  private handleLoadFailure(reason: string): void {
    if (this.gameStateService.data() !== null) return; // game already loaded → not a load failure
    if (this.loadError()) return; // already handling a failure
    this.loadError.set(reason || "Unable to join the game");
    this.gameStateService.clearActiveGameSession();
    this.loadFailRedirect = setTimeout(() => {
      if (this.gameStateService.data() !== null) {
        this.loadError.set(null);
        return;
      }
      this.gameStateService.reset();
      void this.router.navigate(["/home"]);
    }, LOAD_ERROR_REDIRECT_MS);
  }
}
