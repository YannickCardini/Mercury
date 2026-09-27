import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { BOOST_MULTIPLIER, COINS_PER_CAPTURE, type ConsumableEffect } from "@mercury/shared";

/**
 * Jeton d'un booster : médaillon teinté par l'effet qui porte l'opération
 * (« ×2 » pour un doublement, « +1 » pour la prime de capture), avec un
 * satellite qui dit sur quoi elle porte (étoile = points, pièce = pièces).
 *
 * C'est le même objet partout où le booster apparaît (boutique, accueil, jeu,
 * écran de fin) : comme la pièce, un booster est une chose du monde, il ne
 * doit pas changer de dessin d'un écran à l'autre. La taille passe par
 * `--bt-size` sur l'hôte, pour qu'une media query du parent puisse la régler.
 */
@Component({
  selector: "app-boost-token",
  templateUrl: "./boost-token.component.html",
  styleUrl: "./boost-token.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class.bt--points]": "effect() === 'double_points'",
    "[class.bt--coins]": "effect() === 'double_coins'",
    "[class.bt--bounty]": "effect() === 'capture_coins'",
    "[class.is-live]": "live()",
    "aria-hidden": "true",
  },
})
export class BoostTokenComponent {
  effect = input.required<ConsumableEffect>();
  /** Booster en cours d'effet : une orbite tourne autour du médaillon. */
  live = input(false);

  readonly multiplier = BOOST_MULTIPLIER;
  readonly perCapture = COINS_PER_CAPTURE;
}
