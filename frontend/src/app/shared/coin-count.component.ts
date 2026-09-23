import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from "@angular/core";

/**
 * Durée du défilement, indépendante de l'écart : un gain de 8 pièces et un
 * crédit de debug de 500 doivent immobiliser le compteur aussi peu longtemps.
 */
const ROLL_MS = 720;

/**
 * Solde de pièces qui défile jusqu'à sa nouvelle valeur au lieu de sauter.
 *
 * Une monnaie dont le solde change hors champ est une monnaie qu'on oublie :
 * c'est le défilement, pas le chiffre, qui signale au joueur qu'il vient de
 * gagner quelque chose. Le composant est donc partagé par la pastille de nav
 * et le bandeau de la boutique, qui affichent la même valeur.
 *
 * `rolled` porte l'écart signé pour que le parent puisse décorer le moment
 * (pulsation de la pastille, halo) sans recalculer lui-même la variation.
 */
@Component({
  selector: "app-coin-count",
  standalone: true,
  imports: [],
  template: "{{ display() }}",
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: "coin-count",
    "[class.is-rising]": "rising()",
    "[class.is-falling]": "falling()",
  },
  // :host et non .coin-count : en encapsulation émulée, l'élément hôte porte
  // [_nghost-*] et non [_ngcontent-*], donc un sélecteur de classe écrit ici ne
  // l'atteindrait jamais.
  styles: `
    :host {
      display: inline-block;
      /* Chiffres à chasse fixe : sans cela la pastille de nav change de
         largeur à chaque image du défilement et pousse le reste de la rangée. */
      font-variant-numeric: tabular-nums;
      transition: filter 0.2s, text-shadow 0.2s;
    }

    /* On éclaircit la teinte héritée au lieu d'en imposer une : le parent
       (pastille de nav, coffre de la boutique) fixe la couleur, et une règle
       :host(...) de même spécificité que la sienne se jouerait la priorité à
       l'ordre d'insertion des feuilles. */
    :host(.is-rising) {
      filter: brightness(1.5);
      text-shadow: 0 0 10px rgba(224, 177, 90, 0.85);
    }

    :host(.is-falling) {
      opacity: 0.85;
    }
  `,
})
export class CoinCountComponent {
  value = input.required<number>();

  /** Émis au début de chaque défilement, avec l'écart signé. */
  rolled = output<number>();

  readonly display = signal(0);
  readonly rising = signal(false);
  readonly falling = signal(false);

  private frame = 0;
  private settled = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));

    effect(() => {
      const target = this.value();
      // Première valeur connue : posée sans défilement. Sinon le compteur
      // roulerait depuis 0 à chaque navigation, ce qui banaliserait justement
      // le signal qu'on cherche à rendre remarquable.
      if (!this.settled) {
        this.settled = true;
        this.display.set(target);
        return;
      }
      untracked(() => this.rollTo(target));
    });
  }

  private rollTo(target: number): void {
    const from = this.display();
    if (from === target) return;

    const delta = target - from;
    this.rolled.emit(delta);

    if (this.prefersReducedMotion()) {
      this.display.set(target);
      return;
    }

    this.rising.set(delta > 0);
    this.falling.set(delta < 0);

    cancelAnimationFrame(this.frame);
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic : départ vif, fin posée
      this.display.set(Math.round(from + delta * eased));
      if (t < 1) {
        this.frame = requestAnimationFrame(step);
        return;
      }
      this.display.set(target);
      this.rising.set(false);
      this.falling.set(false);
    };
    this.frame = requestAnimationFrame(step);
  }

  private prefersReducedMotion(): boolean {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false; // matchMedia indisponible (WebView ancienne) : on anime
    }
  }
}
