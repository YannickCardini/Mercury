import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Capacitor } from "@capacitor/core";

import { PLAY_STORE_URL } from "./store-url";

/** Refus mémorisé définitivement : la pop-up ne réapparaît plus. */
const DISMISS_KEY = "android_promo_dismissed";

/** Laisse le hero se peindre avant de faire monter la pop-up. */
const REVEAL_DELAY_MS = 1200;

/**
 * Petite pop-up en bas d'écran proposant l'app Android aux visiteurs qui
 * ouvrent le site depuis le navigateur de leur smartphone Android — seul
 * chemin d'installation existant (le projet n'est pas une PWA).
 *
 * Autonome : décide seule de son affichage, sans `@Input` du parent. Montée
 * uniquement par la page d'accueil.
 */
@Component({
  selector: "app-android-app-banner",
  standalone: true,
  imports: [],
  templateUrl: "./android-app-banner.component.html",
  styleUrl: "./android-app-banner.component.scss",
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AndroidAppBannerComponent implements OnInit, OnDestroy {
  readonly storeUrl = PLAY_STORE_URL;
  readonly visible = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (!this.shouldOffer()) return;
    this.timer = setTimeout(() => this.visible.set(true), REVEAL_DELAY_MS);
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }

  dismiss(): void {
    this.visible.set(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage indisponible : la pop-up réapparaîtra, tant pis */
    }
  }

  private shouldOffer(): boolean {
    // Déjà dans l'app native : jamais de promo. Cette garde couvre aussi la
    // WebView Capacitor, dont l'UA contient « Android ».
    if (Capacitor.isNativePlatform()) return false;
    if (typeof navigator === "undefined") return false;

    // Seul endroit du projet où l'on sniffe l'UA : `Capacitor.getPlatform()`
    // renvoie 'web' aussi bien sur desktop que dans Chrome Android, et il n'y
    // a pas d'autre moyen de distinguer les deux.
    if (!/Android/i.test(navigator.userAgent)) return false;

    try {
      return localStorage.getItem(DISMISS_KEY) !== "1";
    } catch {
      return true; // navigation privée / storage bloqué → on propose quand même
    }
  }
}
