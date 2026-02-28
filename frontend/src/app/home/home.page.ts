import { Component, signal, OnDestroy } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { BoardComponent } from './components/board/board.component';
import { TableComponent } from './components/table/table.component';
import { GameStateService } from './services/game-state.service';
import { environment } from '../../environments/environment';
import { Subscription } from 'rxjs';
import { NEW_TURN_BANNER_DURATION_MS } from '@keezen/shared';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrl: 'home.page.scss',
  imports: [IonContent, BoardComponent, TableComponent],
})
export class HomePage implements OnDestroy {

  showNewTurnBanner = signal(false);
  newTurnColor = signal<string>('');
  newTurnName = signal<string>('');

  private newTurnTimeout: ReturnType<typeof setTimeout> | null = null;
  private newTurnSub: Subscription | null = null;

  constructor(public gameStateService: GameStateService) {
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
      this.showNewTurnBanner.set(true);

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
    this.gameStateService.connect(environment.wsUrl, () => this.sendAIPlayers());
  }

  disconnect(): void {
    this.gameStateService.disconnect();
  }

  private sendAIPlayers(): void {
    const players = [
      { name: 'IA Rouge', color: 'red', isHuman: false, isConnected: true },
      { name: 'IA Vert', color: 'green', isHuman: false, isConnected: true },
      { name: 'IA Bleu', color: 'blue', isHuman: false, isConnected: true },
      { name: 'IA Orange', color: 'orange', isHuman: false, isConnected: true },
    ];
    this.gameStateService.send(JSON.stringify({ type: 'start', players }));
  }
}
