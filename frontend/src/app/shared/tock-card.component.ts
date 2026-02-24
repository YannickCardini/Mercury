import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type CardSuit = '♥' | '♦' | '♠' | '♣';
export type PlayerColor = 'red' | 'green' | 'blue' | 'orange';

@Component({
  selector: 'app-tock-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tock-card-face"
         [class.is-red]="isRed"
         >
      <div class="card-inner">
        <div class="card-corner top-left">
          <span class="card-corner-value">{{ value }}</span>
          <span class="card-corner-suit">{{ suit }}</span>
        </div>
        <div class="card-center-suit">{{ suit }}</div>
        <div class="card-corner bottom-right">
          <span class="card-corner-value">{{ value }}</span>
          <span class="card-corner-suit">{{ suit }}</span>
        </div>
      </div>
    </div>
  `,
  styleUrl: 'tock-card.component.scss'
})
export class TockCardComponent {
  @Input() value: string = '';
  @Input() suit: string = '';

  get isRed(): boolean {
    return this.suit === '♥' || this.suit === '♦';
  }
}
