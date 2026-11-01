import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  input,
  untracked,
} from "@angular/core";
import type { ReactionEmoji } from "@mercury/shared";
import { playReactionFx, stopReactionFx } from "./reaction-fx";

/**
 * Scène d'une réaction animée : l'emoji de l'appareil, que reaction-fx.ts fait
 * bouger et entoure d'éléments dessinés le temps de sa mise en scène.
 *
 * La taille vient du parent, par `--rfx-s` (le glyphe en fait 82 %) : la
 * boutique la règle par media query, la partie par clamp(). Au repos, rien ne
 * bouge (pas d'animation en boucle sur une surface, cf. DESIGN.md).
 *
 * - `autoplay` : joue une fois à l'affichage (une réaction reçue en partie) ;
 * - `cue` : chaque nouvelle valeur non nulle rejoue (aperçu en boutique).
 *
 * Encapsulation désactivée : les éléments dessinés sont créés hors gabarit et
 * ne porteraient pas les attributs de styles émulés. Les classes sont donc
 * toutes préfixées `rfx-`.
 */
@Component({
  selector: "app-reaction-fx",
  standalone: true,
  template: '<span class="rfx-mad"><span class="rfx-glyph">{{ emoji() }}</span></span>',
  styleUrl: "./reaction-fx.component.scss",
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "rfx-stage", "aria-hidden": "true" },
})
export class ReactionFxComponent implements OnDestroy {
  readonly emoji = input.required<ReactionEmoji>();
  readonly autoplay = input(false);
  readonly cue = input(0);

  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      if (this.autoplay()) this.play();
    });
    effect(() => {
      if (this.cue() > 0) untracked(() => this.play());
    });
  }

  /** Joue la mise en scène ; renvoie sa durée (0 si rien ne joue). */
  play(): number {
    return playReactionFx(this.host.nativeElement, this.emoji());
  }

  ngOnDestroy(): void {
    stopReactionFx(this.host.nativeElement);
  }
}
