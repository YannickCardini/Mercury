import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';

/** Nombre de pièces envoyées en vol lors d'un achat. */
export const FLIGHT_COINS = 6;
/** Durée du vol d'une pièce, hors décalage de départ. */
const COIN_FLIGHT_MS = 620;
/** Écart de départ entre deux pièces successives. */
const COIN_STAGGER_MS = 55;

/** Une pièce en vol entre le solde et l'objet acheté. Coordonnées viewport. */
interface FlyingCoin {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly lift: number;
  readonly delay: number;
}

/**
 * Pièces en vol au moment d'un achat : le prix quitte physiquement le solde
 * pour rejoindre l'objet. C'est ce trajet, pas le chiffre qui change, qui fait
 * sentir la dépense. Partagé par la boutique et l'écran des boosters, qui
 * vendent tous deux contre la même pièce.
 *
 * Les pièces se placent par rapport au calque : il fonctionne aussi bien posé
 * sur la page que dans une fenêtre transformée, qui devient alors son bloc
 * conteneur (le calque couvre la fenêtre, les vols restent à l'intérieur).
 */
@Component({
  selector: 'app-coin-flight',
  template: `
    @for (c of coins(); track c.id) {
      <span class="cf-coin"
            [style.left.px]="c.x"
            [style.top.px]="c.y"
            [style.--fx]="c.dx + 'px'"
            [style.--fy]="c.dy + 'px'"
            [style.--lift]="c.lift + 'px'"
            [style.animation-delay]="c.delay + 'ms'"></span>
    }
  `,
  styleUrl: './coin-flight.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class CoinFlightComponent {
  readonly coins = signal<readonly FlyingCoin[]>([]);

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearTimeout(this.timer);
    });
  }

  /**
   * Envoie une poignée de pièces du centre de `from` vers celui de `to` et
   * renvoie la durée totale du vol. 0 si l'animation n'a pas lieu (mouvement
   * réduit demandé) : l'appelant poursuit alors sans attendre.
   */
  launch(from: Element, to: Element): number {
    if (prefersReducedMotion()) return 0;

    // Relatif au calque lui-même : posé dans une fenêtre transformée (la carte
    // d'une modale ouverte), il ne couvre plus l'écran mais cette carte.
    const layer = this.host.nativeElement.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const sx = a.left + a.width / 2 - layer.left;
    const sy = a.top + a.height / 2 - layer.top;
    const tx = b.left + b.width / 2 - layer.left;
    const ty = b.top + b.height / 2 - layer.top;

    this.coins.set(
      Array.from({ length: FLIGHT_COINS }, (_, i) => ({
        id: this.seq++,
        x: sx,
        y: sy,
        // Dispersion à l'arrivée et hauteur d'arc variables : six pièces sur la
        // même parabole se liraient comme un seul objet étiré.
        dx: tx - sx + (Math.random() - 0.5) * 26,
        dy: ty - sy + (Math.random() - 0.5) * 18,
        lift: 38 + Math.random() * 46,
        delay: i * COIN_STAGGER_MS,
      })),
    );

    const total = COIN_FLIGHT_MS + (FLIGHT_COINS - 1) * COIN_STAGGER_MS;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.coins.set([]);
    }, total + 80);
    return total;
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false; // matchMedia indisponible (WebView ancienne) : on anime
  }
}
