import { Component, signal, computed, effect, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { BoardComponent } from './components/board/board.component';
import { TableComponent } from './components/table/table.component';
import { VictoryOverlayComponent } from './components/victory-overlay/victory-overlay.component';
import { TutorialOverlayComponent } from './components/tutorial-overlay/tutorial-overlay.component';
import { GameRulesModalComponent } from '../shared/game-rules-modal.component';
import { LoadingScreenComponent } from '../shared/loading-screen.component';
import { GameStateService } from './services/game-state.service';
import { SoundService } from './services/sound.service';
import { environment } from '../../environments/environment';
import { Subscription } from 'rxjs';
import { NEW_TURN_BANNER_DURATION_MS } from '@mercury/shared';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

/** How long the load-failure message stays on the loading screen before redirecting home. */
const LOAD_ERROR_REDIRECT_MS = 3000;

@Component({
  selector: 'app-game',
  templateUrl: 'game.page.html',
  styleUrl: 'game.page.scss',
  imports: [BoardComponent, TableComponent, VictoryOverlayComponent, TutorialOverlayComponent, GameRulesModalComponent, LoadingScreenComponent],
})
export class GamePage implements OnDestroy, AfterViewInit {

  @ViewChild(BoardComponent) private boardRef?: BoardComponent;

  showNewTurnBanner = signal(false);
  showRules = signal(false);
  newTurnColor = signal<string>('');
  newTurnName = signal<string>('');
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

  /** Status line for the initial-load loading screen. */
  loadingStatus = computed(() => {
    const err = this.loadError();
    if (err) return err;
    return this.gameStateService.isConnected()
      ? 'Initializing game data...'
      : 'Connecting to the server...';
  });

  winnerName = computed(() => {
    const color = this.gameStateService.winner();
    if (!color) return '';
    const player = this.gameStateService.data()?.gameState.players.find(p => p.color === color);
    return player?.name ?? color;
  });

  /** True when the local player has no userId (guest / not signed in). */
  isLocalPlayerGuest = computed(() => {
    const color = this.gameStateService.myPlayerColor();
    if (!color) return true;
    const player = this.gameStateService.data()?.gameState.players.find(p => p.color === color);
    return !player?.userId;
  });

  private newTurnTimeout: ReturnType<typeof setTimeout> | null = null;
  private newTurnSub: Subscription | null = null;

  /** Subscriptions that detect a failed reconnection / game start while loading. */
  private loadFailSubs: Subscription[] = [];
  /** Pending redirect-to-home timer shown after a load-failure message. */
  private loadFailRedirect: ReturnType<typeof setTimeout> | null = null;

  constructor(public gameStateService: GameStateService, private soundService: SoundService, private router: Router) {
    effect(() => {
      const winner = this.gameStateService.winner();
      if (!winner) return;
      if (winner === this.gameStateService.myPlayerColor()) {
        this.soundService.playVictory();
      } else {
        this.soundService.playDefeat();
      }
    });

    // ✅ Subscription RxJS propre — réactive à chaque next() du BehaviorSubject,
    // contrairement à .value qui est un snapshot lu une seule fois au moment
    // de l'exécution de l'effect.
    this.newTurnSub = this.gameStateService.newTurn.subscribe(() => {
      const gameData = this.gameStateService.data();
      if (!gameData) return;

      const currentTurn = gameData.gameState?.currentTurn;
      if (!currentTurn) return;

      const player = gameData.gameState.players.find(p => p.color === currentTurn);
      this.newTurnColor.set(currentTurn);
      this.newTurnName.set(player?.name ?? currentTurn);
      this.newTurnPicture.set(player?.picture ?? null);
      this.isReplayBanner.set(this.gameStateService.isReplayTurn());
      if (player?.cardsLeft && player.cardsLeft > 0) {
        this.showNewTurnBanner.set(true);
        if (this.gameStateService.isMyTurn()) {
          this.soundService.playNewTurn();
          if (Capacitor.isNativePlatform() && this.soundService.vibrationEnabled()) {
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
      this.gameStateService.actionRejected$.subscribe(reason => this.handleLoadFailure(reason)),
      this.gameStateService.connectionError$.subscribe(() => this.handleLoadFailure('Could not connect to the game.')),
    );
  }

  backToMenu(): void {
    localStorage.removeItem('guest_player_id');
    localStorage.removeItem('active_game_id');
    this.gameStateService.reset();
    void this.router.navigate(['/home']);
  }

  ngOnDestroy(): void {
    // Évite les memory leaks — toujours se désabonner manuellement
    this.newTurnSub?.unsubscribe();
    this.loadFailSubs.forEach(sub => sub.unsubscribe());
    if (this.newTurnTimeout) clearTimeout(this.newTurnTimeout);
    if (this.loadFailRedirect) clearTimeout(this.loadFailRedirect);
  }

  ngAfterViewInit(): void {
    if (this.gameStateService.isConnected()) {
      requestAnimationFrame(() => this.boardRef?.calculateSquareSize());
      return;
    }
    this.connect();
  }

  connect(): void {
    this.gameStateService.connect(environment.wsUrl, () => {
      const activeGameId = localStorage.getItem('active_game_id');
      const guestPlayerId = localStorage.getItem('guest_player_id');
      if (activeGameId && guestPlayerId) {
        this.gameStateService.sendJoinGame(guestPlayerId, activeGameId);
      } else {
        this.handleLoadFailure('No active game session.');
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
    if (this.loadError()) return;                       // already handling a failure
    this.loadError.set(reason || 'Unable to join the game');
    localStorage.removeItem('active_game_id');
    localStorage.removeItem('guest_player_id');
    this.loadFailRedirect = setTimeout(() => {
      if (this.gameStateService.data() !== null) { this.loadError.set(null); return; }
      this.gameStateService.reset();
      void this.router.navigate(['/home']);
    }, LOAD_ERROR_REDIRECT_MS);
  }

}
