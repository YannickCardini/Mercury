import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { jokerArtUrl, type JokerArtCrop } from "./cards/card-svg";

/**
 * Le bouffon de la carte Joker, seul, à la place de l'emoji 🤡. Une simple
 * image (data-URI SVG mémoïsée, comme les cartes) : rastérisée une fois, sans
 * nœud SVG dans le DOM. Son contour est noir : l'hôte porte le fond papier
 * (`--m-cream`) et la forme (`border-radius`, que l'image reprend).
 */
@Component({
  selector: "app-joker-art",
  template: `<img class="joker-art" [src]="src()" [alt]="label()" draggable="false" decoding="sync" />`,
  styles: `
    :host {
      display: block;
    }

    .joker-art {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      pointer-events: none;
      user-select: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JokerArtComponent {
  readonly crop = input<JokerArtCrop>("full");
  /** Texte alternatif ; vide quand l'image n'est qu'un décor. */
  readonly label = input("");

  protected readonly src = computed(() => jokerArtUrl(this.crop()));
}
