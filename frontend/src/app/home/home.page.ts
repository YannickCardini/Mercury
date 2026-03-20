import { Component, signal, computed, effect, OnDestroy } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { BoardComponent } from './components/board/board.component';
import { TableComponent } from './components/table/table.component';
import { VictoryOverlayComponent } from './components/victory-overlay/victory-overlay.component';
import { GameStateService } from './services/game-state.service';
import { SoundService } from './services/sound.service';
import { environment } from '../../environments/environment';
import { Subscription } from 'rxjs';
import { NEW_TURN_BANNER_DURATION_MS, GameConfig } from '@keezen/shared';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrl: 'home.page.scss',
  imports: [IonContent, BoardComponent, TableComponent, VictoryOverlayComponent],
})
export class HomePage implements OnDestroy {

  showNewTurnBanner = signal(false);
  newTurnColor = signal<string>('');
  newTurnName = signal<string>('');

  winnerName = computed(() => {
    const color = this.gameStateService.winner();
    if (!color) return '';
    const player = this.gameStateService.data()?.gameState.players.find(p => p.color === color);
    return player?.name ?? color;
  });

  private newTurnTimeout: ReturnType<typeof setTimeout> | null = null;
  private newTurnSub: Subscription | null = null;

  constructor(public gameStateService: GameStateService, private soundService: SoundService) {
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
      if (player?.cardsLeft && player.cardsLeft > 0) {
        this.showNewTurnBanner.set(true);
        if (this.gameStateService.isMyTurn())
          this.soundService.playNewTurn();
      }

      if (this.newTurnTimeout) clearTimeout(this.newTurnTimeout);
      this.newTurnTimeout = setTimeout(() => {
        this.showNewTurnBanner.set(false);
      }, NEW_TURN_BANNER_DURATION_MS);
    });
  }

  ngOnDestroy(): void {
    // Évite les memory leaks — toujours se désabonner manuellement
    this.newTurnSub?.unsubscribe();
    if (this.newTurnTimeout) clearTimeout(this.newTurnTimeout);
  }

  ionViewDidEnter(): void {
    this.connect();
  }

  connect(): void {
    this.gameStateService.connect(environment.wsUrl, () => this.sendStart());
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
