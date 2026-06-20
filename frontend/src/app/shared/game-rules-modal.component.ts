import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from "@angular/core";

import { CARD_EFFECT_TILES } from "./card-effects";

@Component({
  selector: "app-game-rules-modal",
  templateUrl: "./game-rules-modal.component.html",
  styleUrl: "./game-rules-modal.component.scss",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [],
})
export class GameRulesModalComponent {
  @Input() show = false;
  @Output() closeModal = new EventEmitter<void>();

  /** Source unique de vérité des effets de carte (partagée avec l'aide en partie). */
  readonly cardTiles = CARD_EFFECT_TILES;
}
