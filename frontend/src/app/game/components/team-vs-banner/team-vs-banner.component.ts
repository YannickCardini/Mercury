import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, OnDestroy, afterNextRender, inject, input } from "@angular/core";
import { GameStateService } from "../../services/game-state.service";
import type { TeamIntroPlayer } from "../team-intro-overlay/team-intro-overlay.component";

/**
 * Bandeau compact "équipe vs équipe" affiché en permanence au-dessus du
 * plateau (mode 2v2 uniquement) : duo losange rouge/bleu à gauche, "VS" au
 * centre, duo rond vert/orange à droite — mêmes formes/couleurs que les
 * pastilles des coins du plateau et l'annonce d'équipe en début de partie.
 *
 * Purement décoratif (pas de nom/rang/carte : déjà visible sur les pastilles
 * du plateau) — la position, l'échelle et la visibilité selon l'espace libre sont
 * calculées par `BoardComponent.layoutTeamBanner` (le plateau garde sa taille max).
 */
@Component({
  selector: "app-team-vs-banner",
  templateUrl: "./team-vs-banner.component.html",
  styleUrl: "./team-vs-banner.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
})
export class TeamVsBannerComponent implements OnDestroy {
  private readonly state = inject(GameStateService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: ResizeObserver;

  constructor() {
    // Mesure la hauteur naturelle (hors transform) ; le plateau décide de la place.
    afterNextRender(() => {
      const inner = this.el.nativeElement.querySelector(".tvb");
      if (!inner) return;
      this.observer = new ResizeObserver(() => this.state.bannerNaturalH.set((inner as HTMLElement).offsetHeight));
      this.observer.observe(inner);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.state.bannerNaturalH.set(0);
    this.state.bannerLayout.set(null);
    this.state.boardShiftY.set(0);
  }

  @HostBinding("style.top.px") get top(): number { return this.state.bannerLayout()?.top ?? 0; }
  @HostBinding("style.transform") get transform(): string {
    return `translateX(-50%) scale(${this.state.bannerLayout()?.scale ?? 1})`;
  }
  @HostBinding("style.visibility") get visibility(): string { return this.state.bannerLayout() ? "visible" : "hidden"; }

  /** Duo affiché à gauche (losanges) — red+blue. */
  leftTeam = input.required<ReadonlyArray<TeamIntroPlayer>>();
  /** Duo affiché à droite (ronds) — green+orange. */
  rightTeam = input.required<ReadonlyArray<TeamIntroPlayer>>();
}
