import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import type { ConsumableEffect } from "@mercury/shared";
import { BoostTokenComponent } from "./boost-token.component";

/**
 * Jetons de boosters en pile : chacun glisse sur le précédent, et au-delà de
 * `max` une pastille « +N » dit combien restent cachés. La pile garde donc la
 * même largeur quel que soit le nombre de boosters équipés : c'est ce qui la
 * rend posable sur l'accueil ou dans une rangée de la boutique.
 *
 * Purement visuel (aria-hidden) : le parent porte le libellé complet.
 */
@Component({
  selector: "app-boost-stack",
  template: `
    @for (e of shown(); track $index) {
      <app-boost-token class="bs-token" [effect]="e" />
    }
    @if (hidden() > 0) {
      <span class="bs-more">+{{ hidden() }}</span>
    }
  `,
  styleUrl: "./boost-stack.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoostTokenComponent],
  host: { "aria-hidden": "true" },
})
export class BoostStackComponent {
  effects = input.required<readonly ConsumableEffect[]>();
  /** Jetons montrés au plus ; les suivants se résument en « +N ». */
  max = input(3);

  // Avec une pastille « +N », elle prend la place du dernier jeton : la pile
  // ne dépasse jamais `max` éléments.
  private overflow = computed(() => this.effects().length > this.max());
  readonly shown = computed(() =>
    this.effects().slice(0, this.overflow() ? this.max() - 1 : this.max())
  );
  readonly hidden = computed(() => this.effects().length - this.shown().length);
}
