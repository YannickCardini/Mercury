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

/**
 * Sur mobile natif (WebView Android), chaque champ d'étoiles est une `box-shadow`
 * de plusieurs centaines de points, dupliquée par un ::after : la peinture
 * initiale et la mémoire de la couche deviennent vite lourdes. On divise les
 * effectifs par ~3 sur natif (densité encore largement suffisante à l'écran).
 */
const STAR_DENSITY = Capacitor.isNativePlatform() ? 0.34 : 1;
const stars = (n: number) => Math.round(n * STAR_DENSITY);

/** État d'un passage de vaisseau (généré aléatoirement à chaque apparition). */
interface ShipState {
  /** Position verticale, en % de la hauteur de l'écran. */
  top: number;
  /** Durée de la traversée, en ms. */
  duration: number;
  /** Sens : true = de gauche à droite, false = de droite à gauche. */
  ltr: boolean;
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
 * Fond d'écran spatial global, rendu une seule fois au niveau de l'app
 * (derrière le router-outlet) pour habiller toutes les routes.
 *
 * Majoritairement CSS/SVG pur — léger sur mobile (Capacitor). Le défilement des
 * étoiles est volontairement très lent (quasi imperceptible). Seul le vaisseau
 * est piloté en JS pour apparaître de façon réellement aléatoire et rare.
 */
@Component({
  selector: "app-space-background",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./space-background.component.html",
  styleUrl: "./space-background.component.scss",
})
export class SpaceBackgroundComponent {
  /** box-shadow listant toutes les étoiles d'une couche (petite / moyenne / grande). */
  protected readonly starsSmall = signal(this.buildStars(stars(700), 1));
  protected readonly starsMedium = signal(this.buildStars(stars(200), 1.6));
  protected readonly starsLarge = signal(this.buildStars(stars(70), 2.4));

  /** Une poignée d'étoiles qui scintillent légèrement. */
  protected readonly twinkles = signal<Twinkle[]>(this.buildTwinkles(9));

  /** Étoiles groupées en bande pour dessiner la Voie lactée (mode calme). */
  protected readonly galaxyStars = signal(this.buildGalaxyStars(stars(820)));

  /** Couche d'étoiles supplémentaire, propre au mode calme (/game), plus dense. */
  protected readonly calmStars = signal(this.buildStars(stars(600), 1.2));

  /** Vaisseau courant (null = aucun passage en cours). */
  protected readonly ship = signal<ShipState | null>(null);

  /**
   * Mode « calme » : sur la route /game, on retire les éléments mouvants
   * (nébuleuses, planètes, vaisseau, étoiles filantes) au profit d'un simple
   * ciel étoilé avec une galaxie, pour ne pas perturber la partie.
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

  private isGameRoute(url: string): boolean {
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
      top: 8 + Math.random() * 55, // 8 %–63 % de hauteur
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
   * une zone de 2000×2000 px. La couche est dupliquée verticalement (cf. SCSS)
   * pour permettre une dérive infinie sans couture.
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
   * Étoiles concentrées le long d'une bande horizontale (répartition ~gaussienne
   * autour du centre du champ) pour évoquer la Voie lactée. Le conteneur est
   * ensuite incliné en CSS pour obtenir la diagonale.
   */
  private buildGalaxyStars(count: number): string {
    const field = 2600;
    const center = field / 2;
    const spread = 200;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const x = Math.round(Math.random() * field);
      // Somme de 3 tirages → distribution centrée sur la bande.
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      const y = Math.round(center + g * spread);
      const blur = (Math.random() * 1.4).toFixed(1);
      const alpha = (0.45 + Math.random() * 0.5).toFixed(2);
      parts.push(`${x}px ${y}px ${blur}px rgba(220,228,255,${alpha})`);
    }
    return parts.join(", ");
  }

  /** Quelques étoiles réparties aléatoirement, au scintillement lent et léger. */
  private buildTwinkles(count: number): Twinkle[] {
    return Array.from({ length: count }, () => ({
      top: Math.random() * 100,
      left: Math.random() * 100,
      size: 1.5 + Math.random() * 2, // 1.5–3.5 px
      delay: Math.random() * 8, // s
      duration: 4 + Math.random() * 5, // 4–9 s
    }));
  }
}
