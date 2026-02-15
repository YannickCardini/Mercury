import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CardSelectorComponent } from '../card-selector/card-selector.component';
import { GameInfoComponent } from '../game-info/game-info.component';

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
  imports: [CardSelectorComponent, GameInfoComponent]
})
export class TableComponent {
  // State using Angular Signals
  hand = signal<Card[]>([
    { id: '1', suit: '♥', value: 'A' },
    { id: '2', suit: '♠', value: 'J' },
    { id: '3', suit: '♦', value: '4' },
    { id: '4', suit: '♣', value: 'K' },
    { id: '5', suit: '♥', value: '7' },
  ]);

  selectedCardIndex = signal<number | null>(null);
  turnPhase = signal<string>('Select a card');
  currentPlayerColor = signal<string>('#ef4444');
  currentPlayerName = signal<string>('Red');

  onCardSelected(index: number) {
    if (this.selectedCardIndex() === index) {
      this.selectedCardIndex.set(null);
      this.turnPhase.set('Select a card');
    } else {
      this.selectedCardIndex.set(index);
      this.turnPhase.set('Select a marble');
    }
  }

  onDrawCards() {
    // Mock drawing cards
    this.hand.set([
      { id: '6', suit: '♦', value: 'Q' },
      { id: '7', suit: '♣', value: '10' },
      { id: '8', suit: '♠', value: '3' },
      { id: '9', suit: '♥', value: 'A' },
    ]);
    this.selectedCardIndex.set(null);
  }
}