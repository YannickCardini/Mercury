import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs";
import { Capacitor } from "@capacitor/core";
import { ThemeService } from "../services/theme.service";

/**
 * true = /game affiche le ciel seul, sans paysage ni animation, sur mobile.
 * false = le même paysage que /home. Le bureau garde toujours le paysage.
 */
const CALM_IN_GAME_MOBILE = false;

/** Mobile = appli native ou écran étroit (même seuil que la mise en page de /game). */
const isMobile = (): boolean =>
  Capacitor.isNativePlatform() ||
  (typeof matchMedia === "function" && matchMedia("(max-width: 780px)").matches);

/** État d'un passage de vaisseau (généré aléatoirement à chaque apparition). */
interface ShipState {
  /** Position verticale, en % de la hauteur de l'écran. */
  top: number;
  /** Durée de la traversée, en ms. */
  duration: number;
  /** Sens : true = de gauche à droite, false = de droite à gauche. */
  ltr: boolean;
}

/** Le ciel étoilé : trois couches de box-shadow et les étoiles qui scintillent. */
interface StarField {
  small: string;
  medium: string;
  large: string;
  twinkles: Twinkle[];
}

/** Étoile scintillante individuelle (placée par-dessus les champs statiques). */
interface Twinkle {
  top: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
}

/**
 * Fond d'écran global, rendu une seule fois au niveau de l'app (derrière le
 * router-outlet) pour habiller toutes les routes : Mars en cours de
 * terraformation, en aplats étagés. Mesas, collines, plaine, cratères, colonie
 * de dômes et lac de cratère, avec des brumes qui dérivent lentement.
 *
 * Le paysage est le même dans les deux modes (ThemeService), seule sa palette
 * change ; le ciel, lui, change d'objets. Le jour : ciel clair en bandes et
 * double lever de soleil. La nuit : ciel bleu nuit étoilé, Phobos et Deimos,
 * fenêtres de la colonie allumées, étoiles filantes rares et un vaisseau de
 * loin en loin.
 *
 * SVG statique dans le gabarit (dessiné par resources/mars/), léger sur mobile
 * (Capacitor). Seul le vaisseau est piloté en JS, pour apparaître de façon
 * réellement aléatoire et rare.
 */
@Component({
  selector: "app-space-background",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./space-background.component.html",
  styleUrl: "./space-background.component.scss",
})
export class SpaceBackgroundComponent {
  /**
   * Le ciel étoilé, créé à la première nuit affichée puis gardé (les étoiles
   * ne changent pas de place d'une nuit à l'autre). Le jour, rien n'est
   * calculé : un démarrage en mode jour n'en paie pas le coût.
   */
  private stars?: StarField;

  /** Vaisseau courant (null = aucun passage en cours). */
  protected readonly ship = signal<ShipState | null>(null);

  /** Mode jour : ciel du matin et soleils ; sinon ciel de nuit et lunes. */
  protected readonly isDay = inject(ThemeService).isDay;

  /**
   * Mode « calme » : sur la route /game, le plateau cache le paysage. Rien
   * n'est rendu sinon le ciel en bandes de l'hôte (--m-sky), sans animation,
   * pour ne pas alourdir la partie.
   */
  protected readonly calm = signal(false);

  private readonly router = inject(Router);
  private shipTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.calm.set(this.isGameRoute(this.router.url));
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((e) => this.calm.set(this.isGameRoute(e.urlAfterRedirects)));

    const reduceMotion =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduceMotion) {
      this.scheduleShip();
    }

    inject(DestroyRef).onDestroy(() => {
      if (this.shipTimer) clearTimeout(this.shipTimer);
    });
  }

  /** Le ciel étoilé, calculé une seule fois, à la première nuit. */
  protected starField(): StarField {
    return (this.stars ??= {
      small: this.buildStars(700, 1),
      medium: this.buildStars(200, 1.6),
      large: this.buildStars(70, 2.4),
      twinkles: this.buildTwinkles(9),
    });
  }

  private isGameRoute(url: string): boolean {
    // ESSAI 2026-10-17 : fond minimal dans /game sur mobile (moins d'énergie,
    // moins de fatigue visuelle), à comparer au verre dépoli sur paysage complet.
    // `CALM_IN_GAME_MOBILE = false` rétablit le paysage complet.
    if (!CALM_IN_GAME_MOBILE || !isMobile()) return false;
    return url.split("?")[0].startsWith("/game");
  }

  /** Planifie le prochain passage de vaisseau après un délai aléatoire et long. */
  private scheduleShip(): void {
    // 1,5 min à 5 min entre deux passages → rare et imprévisible.
    const delay = 90_000 + Math.random() * 210_000;
    this.shipTimer = setTimeout(() => this.launchShip(), delay);
  }

  /** Déclenche un passage avec hauteur, sens et vitesse aléatoires. */
  private launchShip(): void {
    const duration = 9_000 + Math.random() * 7_000; // 9–16 s de traversée
    this.ship.set({
      top: 8 + Math.random() * 30, // 8 %–38 % : dans le ciel, au-dessus des mesas
      duration,
      ltr: Math.random() < 0.5,
    });

    // Une fois la traversée finie, on masque puis on replanifie.
    this.shipTimer = setTimeout(() => {
      this.ship.set(null);
      this.scheduleShip();
    }, duration);
  }

  /**
   * Génère une chaîne `box-shadow` plaçant `count` points lumineux répartis sur
   * une zone de 2000×2000 px. Le paysage cache ceux qui tombent sous l'horizon.
   */
  private buildStars(count: number, maxBlur: number): string {
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const x = Math.round(Math.random() * 2000);
      const y = Math.round(Math.random() * 2000);
      const blur = (Math.random() * maxBlur).toFixed(1);
      const alpha = (0.45 + Math.random() * 0.55).toFixed(2);
      parts.push(`${x}px ${y}px ${blur}px rgba(255,255,255,${alpha})`);
    }
    return parts.join(", ");
  }

  /**
   * Quelques étoiles réparties aléatoirement dans le ciel (au-dessus de
   * l'horizon le plus haut, 53 %), au scintillement lent et léger.
   */
  private buildTwinkles(count: number): Twinkle[] {
    return Array.from({ length: count }, () => ({
      top: Math.random() * 44,
      left: Math.random() * 100,
      size: 1.5 + Math.random() * 2, // 1.5–3.5 px
      delay: Math.random() * 8, // s
      duration: 4 + Math.random() * 5, // 4–9 s
    }));
  }
}
