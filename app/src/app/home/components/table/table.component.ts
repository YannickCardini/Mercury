import { CommonModule } from '@angular/common';
import { GameStateService } from './../../services/game-state.service';
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

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
  imports: [CommonModule]
})
export class TableComponent {

  constructor(private gameStateService: GameStateService) { }


  selectedCardIndex = signal<number | null>(null);
  turnPhase = signal<string>('Select a card');

  onCardSelected(index: number) {
    if (this.selectedCardIndex() === index) {
      this.selectedCardIndex.set(null);
      this.turnPhase.set('Select a card');
    } else {
      this.selectedCardIndex.set(index);
      this.turnPhase.set('Select a marble');
    }
  }

  selectCard(index: number) {
    this.onCardSelected(index);
  }

  getPlayerHand(): Card[] {
    const gameData = this.gameStateService.data();
    if (!gameData) return [];
    return gameData.gameState.hand;
  }

  getPlayerName(): string {
    const gameData = this.gameStateService.data();
    if (!gameData) return '';
    return gameData.gameState.players.find((p: any) => p.color === gameData.gameState.currentTurn)?.name || '';
  }

  getPlayerColor(): string {
    const gameData = this.gameStateService.data();
    if (!gameData) return '';
    return gameData.gameState.currentTurn;
  }

  // On récupère la défausse depuis le service
  getDiscardedCards(): Card[] {
    const gameData = this.gameStateService.data();
    // Supposons que ton backend renvoie discardedPile dans gameState
    return gameData?.gameState.discardedCards || [];
  }

  confirmMove() {
    console.log("Action confirmée avec la carte d'index :", this.selectedCardIndex());
    // Ici tu appelles ton service pour envoyer le mouvement
    // this.gameStateService.playCard(this.selectedCardIndex());

    // Reset après confirmation
    this.selectedCardIndex.set(null);
    this.turnPhase.set('Sélectionnez une carte');
  }
}