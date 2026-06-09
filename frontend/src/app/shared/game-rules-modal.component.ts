import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CARD_EFFECT_TILES } from './card-effects';

@Component({
  selector: 'app-game-rules-modal',
  templateUrl: './game-rules-modal.component.html',
  styleUrl: './game-rules-modal.component.scss',
  standalone: true,
  imports: [CommonModule],
})
export class GameRulesModalComponent {
  @Input() show = false;
  @Output() closeModal = new EventEmitter<void>();

  /** Source unique de vérité des effets de carte (partagée avec l'aide en partie). */
  readonly cardTiles = CARD_EFFECT_TILES;
}
