import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import type { ConsumableShopItem } from "@mercury/shared";
import { BoostShelfComponent } from "./boost-shelf.component";

/**
 * Qui est le joueur : photo, nom, rang et points, et les boosters avec
 * lesquels il joue chaque partie, posés côte à côte (infobulle au survol ou
 * au toucher). Le même objet pour sa propre fenêtre de profil (volet gauche)
 * et pour le profil public d'un autre joueur.
 *
 * Emplacements projetés :
 *  - `[pc-boost-action]` : sous les boosters (« Manage boosters »…) ;
 *  - contenu par défaut : le pied de la carte (actions du compte, infos).
 */
@Component({
  selector: "app-player-card",
  templateUrl: "./player-card.component.html",
  styleUrl: "./player-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoostShelfComponent, DecimalPipe],
})
export class PlayerCardComponent {
  name = input.required<string>();
  picture = input<string | null | undefined>(null);
  points = input<number>(0);
  /** 0 ou absent : pas encore classé, la tuile de rang ne s'affiche pas. */
  ranking = input<number>(0);
  boosts = input<readonly ConsumableShopItem[]>([]);
  /** Ligne sous le titre Boosters : « 2 of 3 slots used », « equipped »… */
  boostsNote = input<string>("");
  /** Section des boosters : masquée quand le serveur ne les envoie pas. */
  showBoosts = input(true);
  /** Texte quand aucun booster n'est équipé. */
  emptyNote = input<string>("No boosters equipped.");
}
