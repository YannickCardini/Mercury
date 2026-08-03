import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { TeamIntroPlayer } from "../team-intro-overlay/team-intro-overlay.component";

/**
 * Bandeau compact "équipe vs équipe" affiché en permanence au-dessus du
 * plateau (mode 2v2 uniquement) : duo losange rouge/bleu à gauche, "VS" au
 * centre, duo rond vert/orange à droite — mêmes formes/couleurs que les
 * pastilles des coins du plateau et l'annonce d'équipe en début de partie.
 *
 * Purement décoratif (pas de nom/rang/carte : déjà visible sur les pastilles
 * du plateau) — la visibilité selon l'espace disponible est gérée en CSS par
 * le composant hôte (`team-vs-banner.component.scss`), pas ici.
 */
@Component({
  selector: "app-team-vs-banner",
  templateUrl: "./team-vs-banner.component.html",
  styleUrl: "./team-vs-banner.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
})
export class TeamVsBannerComponent {
  /** Duo affiché à gauche (losanges) — red+blue. */
  leftTeam = input.required<ReadonlyArray<TeamIntroPlayer>>();
  /** Duo affiché à droite (ronds) — green+orange. */
  rightTeam = input.required<ReadonlyArray<TeamIntroPlayer>>();
}
