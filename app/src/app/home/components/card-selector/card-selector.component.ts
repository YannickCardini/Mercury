import { Component, ChangeDetectionStrategy, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Card {
    id: string;
    suit: string;
    value: string;
}

@Component({
    selector: 'app-card-selector',
    templateUrl: 'card-selector.component.html',
    styleUrl: 'card-selector.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [CommonModule]
})
export class CardSelectorComponent {
    hand = input<Card[]>([]);
    selectedCardIndex = input<number | null>(null);
    turnPhase = input<string>('Select a card');
    currentPlayerColor = input<string>('#ef4444');
    currentPlayerName = input<string>('Red');

    cardSelected = output<number>();
    drawCardsClicked = output<void>();

    selectCard(index: number) {
        this.cardSelected.emit(index);
    }

    drawCards() {
        this.drawCardsClicked.emit();
    }
}
