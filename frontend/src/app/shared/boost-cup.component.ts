import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { ConsumableEffect } from "@mercury/shared";
import { BoostTokenComponent } from "./boost-token.component";

/**
 * Emplacement d'équipement : un creux taillé comme les trous du plateau (et
 * l'alvéole des billes du bandeau d'équipes), où se pose le jeton du booster
 * équipé. Vide, il montre un « + » en creux.
 *
 * Purement visuel : l'interaction (retirer, choisir) appartient au parent, qui
 * l'enveloppe dans un bouton. La taille passe par `--cup-size` sur l'hôte ;
 * le jeton en occupe les deux tiers.
 */
@Component({
  selector: "app-boost-cup",
  template: `
    @if (effect(); as e) {
      <app-boost-token class="cup-token" [effect]="e" />
    } @else {
      <svg class="cup-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
        <path d="M12 6v12M6 12h12" />
      </svg>
    }
  `,
  styleUrl: "./boost-cup.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoostTokenComponent],
  host: {
    "[class.is-empty]": "!effect()",
    // Teinte des anneaux de pose : celle du jeton (voir boost-cup.scss).
    "[attr.data-effect]": "effect()",
    "aria-hidden": "true",
  },
})
export class BoostCupComponent {
  /** Effet du booster posé dans le creux, ou null pour un emplacement libre. */
  effect = input<ConsumableEffect | null>(null);
}
