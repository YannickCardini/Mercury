import { CommonModule } from '@angular/common';
import { GameStateService } from './../../services/game-state.service';
import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { IonGrid, IonCol, IonRow } from '@ionic/angular/standalone';

interface Card {
  id: string;
  suit: string;
  value: string;
}

@Component({
  selector: 'app-table',
  templateUrl: 'table.component.html',
  styleUrl: 'table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, IonGrid, IonCol, IonRow]
})
export class TableComponent {
  // Signaux pour l'état de l'UI
  selectedCardIndex = signal<number | null>(null);
  turnPhase = signal<string>('Select a card');
  timeLeft = signal<number>(30); // Timer de 30 secondes

  // Dérivé pour savoir si le bouton de confirmation doit être activé
  canConfirm = computed(() => this.selectedCardIndex() !== null);

  constructor(private gameStateService: GameStateService) { }

  onCardSelected(index: number) {
    if (this.selectedCardIndex() === index) {
      this.selectedCardIndex.set(null);
      this.turnPhase.set('Select a card');
    } else {
      this.selectedCardIndex.set(index);
      this.turnPhase.set('Select a marble');
    }
  }

  getPlayerHand(): Card[] {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.hand || [];
  }

  getPlayerName(): string {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.players.find((p: any) => p.color === gameData.gameState.currentTurn)?.name || 'Unknown';
  }

  getPlayerColor(): string {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.currentTurn || '#ffffff';
  }

  getDiscardedCards(): Card[] {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.discardedCards || [];
  }

  confirmMove() {
    if (!this.canConfirm()) return;

    console.log("Action confirmée avec la carte d'index :", this.selectedCardIndex());
    // this.gameStateService.playCard(this.selectedCardIndex());

    this.selectedCardIndex.set(null);
    this.turnPhase.set('Select a card');
    this.timeLeft.set(30); // Reset du timer
  }
}