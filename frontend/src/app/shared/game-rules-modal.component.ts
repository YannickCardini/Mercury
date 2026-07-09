import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from "@angular/core";

import { getCardEffectTiles } from "./card-effects";
import type { GameMode } from "@mercury/shared";

@Component({
  selector: "app-game-rules-modal",
  templateUrl: "./game-rules-modal.component.html",
  styleUrl: "./game-rules-modal.component.scss",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [],
})
export class GameRulesModalComponent {
  @Input() set show(value: boolean) {
    // À l'ouverture, présenter d'abord l'onglet correspondant au mode en cours.
    if (value && !this._show) {
      this.activeTab.set(this.gameMode === "2v2" ? "teams" : "basics");
    }
    this._show = value;
  }
  get show(): boolean {
    return this._show;
  }
  private _show = false;

  /**
   * Mode de jeu courant : sélectionne l'onglet ouvert par défaut et adapte les
   * textes des cartes (J, 7). Défaut '2v2' = mode standard du serveur (utilisé
   * hors partie, ex. depuis la home, où le client ne connaît pas le mode réel).
   */
  @Input() gameMode: GameMode = "2v2";

  @Output() closeModal = new EventEmitter<void>();

  /** Onglet affiché : règles de base, ou spécificités du mode équipes 2v2. */
  readonly activeTab = signal<"basics" | "teams">("teams");

  /** Source unique de vérité des effets de carte (partagée avec l'aide en partie). */
  get cardTiles() {
    return getCardEffectTiles(this.gameMode === "2v2");
  }
}
