import { Component, signal, effect } from '@angular/core';
import { IonContent, ViewDidEnter } from '@ionic/angular/standalone';
import { BoardComponent } from './components/board/board.component';
import { TableComponent } from './components/table/table.component';
import { GameStateService } from './services/game-state.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrl: 'home.page.scss',
  imports: [IonContent, BoardComponent, TableComponent],
})
export class HomePage implements ViewDidEnter {

  /** Affiche l'overlay "Nouveau tour" */
  showNewTurnBanner = signal(false);
  /** Couleur du joueur dont c'est le tour */
  newTurnColor = signal<string>('');
  /** Nom du joueur dont c'est le tour */
  newTurnName = signal<string>('');

  private newTurnTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(public gameStateService: GameStateService) {
    // Réagit à chaque nouveau tour
    effect(() => {
      // S'abonner au BehaviorSubject via un simple trick signal-compatible
      const turn = this.gameStateService.newTurn.value;
      if (!turn) return;

      const gameData = this.gameStateService.data();
      if (!gameData) return;

      const currentTurn = gameData.gameState?.currentTurn;
      if (!currentTurn) return;

      const player = gameData.gameState.players.find(p => p.color === currentTurn.color);
      this.newTurnColor.set(currentTurn.color);
      this.newTurnName.set(player?.name ?? currentTurn.color);
      this.showNewTurnBanner.set(true);

      if (this.newTurnTimeout) clearTimeout(this.newTurnTimeout);
      this.newTurnTimeout = setTimeout(() => {
        this.showNewTurnBanner.set(false);
      }, 2500);
    });
  }

  ionViewDidEnter(): void {
    this.connect();
  }

  connect() {
    this.gameStateService.connect(environment.wsUrl, () => this.sendAIPlayers());
  }

  disconnect() {
    this.gameStateService.disconnect();
  }

  private sendAIPlayers() {
    const players = [
      { name: 'IA Rouge', color: 'red', isHuman: false, isConnected: true },
      { name: 'IA Vert', color: 'green', isHuman: false, isConnected: true },
      { name: 'IA Bleu', color: 'blue', isHuman: false, isConnected: true },
      { name: 'IA Orange', color: 'orange', isHuman: false, isConnected: true },
    ];
    this.gameStateService.send(JSON.stringify({ type: 'start', players }));
  }
}