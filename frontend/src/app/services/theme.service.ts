import { ApplicationRef, Injectable, computed, inject, signal } from "@angular/core";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

export type Theme = "day" | "night";

/** Lu aussi par le script de src/index.html, avant le premier rendu. */
const STORAGE_KEY = "mercury-theme";

/**
 * Deux bascules animées (voir styles.scss) :
 * - « scene » : le soir tombe ou l'aube se lève sur le paysage, environ 1,5 s
 *   (accueil et pages) ;
 * - « quick » : un simple fondu de tout l'écran, environ 0,2 s (dans /game,
 *   où le plateau cache le paysage et où la partie ne doit pas s'alourdir).
 */
export type ThemeSwitchStyle = "scene" | "quick";

/**
 * Pendant une bascule animée, les icônes des barres système changent à
 * mi-chemin, quand l'interface passe d'un mode à l'autre.
 */
const BARS_SWITCH_DELAY_MS: Record<ThemeSwitchStyle, number> = { scene: 550, quick: 110 };

interface ViewTransitionLike {
  finished: Promise<void>;
}

type DocumentWithTransitions = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
};

/**
 * Mode jour / nuit de toute l'app.
 *
 * Tant que le joueur n'a rien choisi, le mode suit le réglage clair / sombre
 * du téléphone, et le suit encore s'il change en cours de route. Un choix fait
 * avec `toggle()` est gardé sur l'appareil (comme le son) et prime ensuite.
 *
 * Le mode est posé sur <html data-theme="day|night"> : tokens.css redéfinit
 * les --m-* du jour sous cet attribut, les composants n'ont rien à lire. Sur
 * Android, les icônes des barres système suivent : sombres sur le paysage
 * clair du jour, claires sur le ciel de nuit.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly appRef = inject(ApplicationRef);

  private readonly choice = signal<Theme | null>(readChoice());
  private readonly systemDark = signal(true);
  /** Faux tant que le splash natif est affiché (voir releaseSystemBars). */
  private barsReleased = false;
  /** Bascule animée en cours, pour ne retirer son attribut qu'à sa fin. */
  private switching: ViewTransitionLike | null = null;

  readonly theme = computed<Theme>(
    () => this.choice() ?? (this.systemDark() ? "night" : "day")
  );
  readonly isDay = computed(() => this.theme() === "day");

  constructor() {
    if (typeof matchMedia === "function") {
      const query = matchMedia("(prefers-color-scheme: dark)");
      this.systemDark.set(query.matches);
      query.addEventListener("change", (e) => {
        this.systemDark.set(e.matches);
        this.apply(this.theme());
      });
    }
    this.apply(this.theme());
  }

  /**
   * Passe à l'autre mode et le retient. Là où le navigateur sait animer un
   * changement de page (View Transitions), la bascule est animée selon
   * `style` (voir ThemeSwitchStyle) ; sinon, ou avec mouvement réduit,
   * immédiate.
   */
  toggle(style: ThemeSwitchStyle = "scene"): void {
    const next: Theme = this.theme() === "day" ? "night" : "day";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Stockage indisponible : le choix vaut pour la session seulement.
    }

    const doc = document as DocumentWithTransitions;
    const reduceMotion =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!doc.startViewTransition || reduceMotion) {
      this.choice.set(next);
      this.apply(next);
      return;
    }

    // Posé avant l'instantané « avant » : pour la scène, il nomme les calques à
    // fondre et choisit le sens (soir ou aube) ; « quick » ne nomme rien.
    const root = document.documentElement;
    root.dataset["themeSwitch"] = style === "quick" ? "quick" : next === "night" ? "dusk" : "dawn";

    // L'instantané « après » est pris dès le retour du rappel : Angular doit
    // avoir déjà rendu le nouveau ciel (astres, étoiles), d'où le tick.
    const transition = doc.startViewTransition(() => {
      this.choice.set(next);
      this.apply(next, BARS_SWITCH_DELAY_MS[style]);
      this.appRef.tick();
    });
    this.switching = transition;
    // Une bascule relancée avant la fin de la précédente l'interrompt : seule
    // la dernière retire l'attribut.
    transition.finished.finally(() => {
      if (this.switching !== transition) return;
      this.switching = null;
      delete root.dataset["themeSwitch"];
    });
  }

  /**
   * Appelé quand le splash natif disparaît (AppComponent). Jusque-là les
   * icônes des barres système gardent le style clair de capacitor.config.ts,
   * lisible sur le splash sombre ; ensuite elles suivent le mode.
   */
  releaseSystemBars(): void {
    this.barsReleased = true;
    this.syncSystemBars(this.theme());
  }

  private apply(theme: Theme, barsDelayMs = 0): void {
    document.documentElement.dataset["theme"] = theme;
    if (barsDelayMs > 0) {
      setTimeout(() => this.syncSystemBars(this.theme()), barsDelayMs);
    } else {
      this.syncSystemBars(theme);
    }
  }

  private syncSystemBars(theme: Theme): void {
    if (!this.barsReleased || !Capacitor.isNativePlatform()) return;
    SystemBars.setStyle({
      style: theme === "day" ? SystemBarsStyle.Light : SystemBarsStyle.Dark,
    }).catch(() => {});
  }
}

function readChoice(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "day" || stored === "night" ? stored : null;
  } catch {
    return null;
  }
}
