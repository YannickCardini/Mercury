import { Component, signal, computed, effect, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { BoardComponent } from './components/board/board.component';
import { TableComponent } from './components/table/table.component';
import { VictoryOverlayComponent } from './components/victory-overlay/victory-overlay.component';
import { GameRulesModalComponent } from '../shared/game-rules-modal.component';
import { LoadingScreenComponent } from '../shared/loading-screen.component';
import { GameStateService } from './services/game-state.service';
import { SoundService } from './services/sound.service';
import { environment } from '../../environments/environment';
import { Subscription } from 'rxjs';
import { NEW_TURN_BANNER_DURATION_MS, GameConfig } from '@mercury/shared';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-game',
  templateUrl: 'game.page.html',
  styleUrl: 'game.page.scss',
  imports: [BoardComponent, TableComponent, VictoryOverlayComponent, GameRulesModalComponent, LoadingScreenComponent],
})
export class GamePage implements OnDestroy, AfterViewInit {

  @ViewChild(BoardComponent) private boardRef?: BoardComponent;

  showNewTurnBanner = signal(false);
  showRules = signal(false);
  newTurnColor = signal<string>('');
  newTurnName = signal<string>('');
  newTurnPicture = signal<string | null>(null);

  /** Status line for the initial-load loading screen. */
  loadingStatus = computed(() =>
    this.gameStateService.isConnected()
      ? 'Initializing game data...'
      : 'Connecting to the server...'
  );

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
      if (player?.cardsLeft && player.cardsLeft > 0) {
        this.showNewTurnBanner.set(true);
        if (this.gameStateService.isMyTurn()) {
          this.soundService.playNewTurn();
          if (Capacitor.isNativePlatform()) {
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
  }

  backToMenu(): void {
    localStorage.removeItem('guest_player_id');
    this.gameStateService.reset();
    void this.router.navigate(['/home']);
  }

  ngOnDestroy(): void {
    // Évite les memory leaks — toujours se désabonner manuellement
    this.newTurnSub?.unsubscribe();
    if (this.newTurnTimeout) clearTimeout(this.newTurnTimeout);
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
        this.sendStart();
      }
    });
  }

  disconnect(): void {
    this.gameStateService.disconnect();
  }

  private sendStart(): void {
    // ── Config de la partie ──────────────────────────────────────────────────
    // Changer isHuman à true pour jouer en tant que joueur rouge.
    // Tous les autres joueurs restent IA.
    const config: GameConfig = {
      players: [
        { name: 'Moi', color: 'red', isHuman: true },
        { name: 'IA Vert', color: 'green', isHuman: false },
        { name: 'IA Bleu', color: 'blue', isHuman: false },
        { name: 'IA Orange', color: 'orange', isHuman: false },
      ],
    };
    this.gameStateService.setConfig(config);
    this.gameStateService.send(JSON.stringify({ type: 'start', config }));
  }
}
