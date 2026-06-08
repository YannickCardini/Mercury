import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type CardSuit = '♥' | '♦' | '♠' | '♣';

@Component({
  selector: 'app-tock-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tock-card-face"
         [class.is-red]="isRed"
         [class.is-joker]="isJoker"
         >
      <div class="card-inner">
        @if (isJoker) {
          <div class="joker-face">
            <span class="joker-mark">🤡</span>
            <span class="joker-label">
            <span class="jl-red">J</span><span class="jl-black">O</span>
            <span class="jl-red">K</span><span class="jl-black">E</span>
            <span class="jl-red">R</span>
            </span>
          </div>
        } @else {
          <div class="card-corner top-left">
            <span class="card-corner-value">{{ value }}</span>
            <span class="card-corner-suit">{{ suit }}</span>
          </div>
          <div class="card-center-suit">{{ suit }}</div>
          <div class="card-corner bottom-right">
            <span class="card-corner-value">{{ value }}</span>
            <span class="card-corner-suit">{{ suit }}</span>
          </div>
        }
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

  get isJoker(): boolean {
    return this.value === 'Joker';
  }
}
