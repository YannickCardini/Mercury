import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from "@angular/core";

import { Capacitor } from "@capacitor/core";

import { getCardEffectTiles } from "./card-effects";
import { JokerArtComponent } from "./joker-art.component";

@Component({
  selector: "app-game-rules-modal",
  templateUrl: "./game-rules-modal.component.html",
  styleUrl: "./game-rules-modal.component.scss",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  // `is-native` : garde en CSS les calques de la modale ouverte sur WebView
  // Android (flash d'une frame à la fin de l'animation d'entrée).
  host: { "[class.is-native]": "isNative" },
  imports: [JokerArtComponent],
})
export class GameRulesModalComponent {
  readonly isNative = Capacitor.isNativePlatform();

  @Input() show = false;

  @Output() closeModal = new EventEmitter<void>();

  /** Source unique de vérité des effets de carte (partagée avec l'aide en partie). */
  readonly cardTiles = getCardEffectTiles();
}
