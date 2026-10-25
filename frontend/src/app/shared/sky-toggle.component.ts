import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { ThemeService } from "../services/theme.service";

/**
 * Bascule jour / nuit de l'accueil : « hublot du ciel ».
 *
 * Une touche ronde dont la face est l'horizon du paysage martien à l'heure
 * qu'il est (les soleils le jour, Phobos et Deimos la nuit). À l'appui, le
 * hublot joue le soir ou l'aube au même rythme que le paysage (voir le SCSS
 * et styles.scss, qui le sort de l'instantané de la page pendant la bascule).
 */
@Component({
  selector: "app-sky-toggle",
  standalone: true,
  templateUrl: "./sky-toggle.component.html",
  styleUrls: ["./sky-toggle.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkyToggleComponent {
  protected readonly theme = inject(ThemeService);
}
