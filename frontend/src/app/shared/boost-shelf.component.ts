import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { ConsumableShopItem } from "@mercury/shared";
import { BoostCupComponent } from "./boost-cup.component";
import { BoostTipComponent } from "./boost-tip.component";

/**
 * Les boosters équipés d'un joueur, posés côte à côte chacun dans son creux,
 * sur autant de lignes qu'il en faut. Visibles d'emblée, sans toucher :
 * l'infobulle de chacun (survol ou toucher) donne son nom et son effet.
 * Utilisé par la fenêtre du profil (les siens) et par le profil public.
 */
@Component({
  selector: "app-boost-shelf",
  template: `
    <ul class="shelf">
      @for (b of boosts(); track b.id) {
        <li class="shelf-item">
          <app-boost-tip [boost]="b">
            <app-boost-cup class="shelf-cup" [effect]="b.effect" />
          </app-boost-tip>
        </li>
      }
    </ul>
  `,
  styles: `
    /* Taille du creux par --shelf-cup sur l'hôte (le jeton en prend les deux
       tiers), alignement des rangées par --shelf-justify. */
    :host {
      --shelf-cup: 56px;
      display: block;
    }

    .shelf {
      list-style: none;
      margin: 0;
      padding: 0 0 4px; /* l'étiquette du montant déborde sous le dernier rang */
      display: flex;
      flex-wrap: wrap;
      justify-content: var(--shelf-justify, flex-start);
      gap: 10px 12px;
    }

    .shelf-item {
      display: flex;
    }

    .shelf-cup {
      --cup-size: var(--shelf-cup);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoostCupComponent, BoostTipComponent],
})
export class BoostShelfComponent {
  boosts = input.required<readonly ConsumableShopItem[]>();
}
