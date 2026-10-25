import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import {
  BOOST_MULTIPLIER,
  COINS_PER_CAPTURE,
  PAIR_BONUS_COINS,
  PERFECT_GAME_POINTS,
  type ConsumableEffect,
} from "@mercury/shared";

/** L'opération inscrite sur la face, par effet : le signe, puis le nombre. */
const FACE: Record<ConsumableEffect, readonly [string, number]> = {
  double_points: ["×", BOOST_MULTIPLIER],
  double_coins: ["×", BOOST_MULTIPLIER],
  capture_coins: ["+", COINS_PER_CAPTURE],
  pair_home: ["+", PAIR_BONUS_COINS],
  pair_capture: ["+", PAIR_BONUS_COINS],
  perfect_win: ["+", PERFECT_GAME_POINTS],
};

/** Étoile à quatre branches des points (repère 24 × 24, centrée sur 12, 12). */
const STAR =
  "M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5Z";

/**
 * Jeton d'un booster : médaillon à la couleur de son effet, avec son propre
 * dessin, fait des objets du plateau : deux étoiles (Double Points), deux
 * pièces (Double Coins), une bille frappée (Bounty), deux billes frappées
 * d'un coup (Double Strike), deux billes dans le couloir d'arrivée
 * (Homecoming), les quatre billes rentrées sous l'étoile des points (Perfect
 * Game). Le montant (« ×2 », « +1 », « +50 ») est une étiquette collée
 * au bord, masquée quand le jeton est trop petit pour la lire : le dessin
 * suffit alors à le reconnaître.
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
    "[class.bt--home]": "effect() === 'pair_home'",
    "[class.bt--strike]": "effect() === 'pair_capture'",
    "[class.bt--perfect]": "effect() === 'perfect_win'",
    "[class.is-live]": "live()",
    "aria-hidden": "true",
  },
})
export class BoostTokenComponent {
  effect = input.required<ConsumableEffect>();
  /** Booster en cours d'effet : une orbite tourne autour du médaillon. */
  live = input(false);

  readonly star = STAR;
  readonly sign = computed(() => FACE[this.effect()]?.[0] ?? "×");
  readonly amount = computed(() => FACE[this.effect()]?.[1] ?? BOOST_MULTIPLIER);
}
