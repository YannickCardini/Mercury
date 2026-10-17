import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, OnDestroy, afterNextRender, computed, inject, input } from "@angular/core";
import type { MarbleColor } from "@mercury/shared";
import { GameStateService } from "../../services/game-state.service";
import type { TeamIntroPlayer } from "../team-intro-overlay/team-intro-overlay.component";

/** Un siège du bandeau : la couleur de ses billes et le nom affiché. */
interface BannerSeat {
  color: MarbleColor;
  label: string;
  isMe: boolean;
}

/**
 * Bandeau d'équipes du mode 2v2 : un fronton taillé dans le verre du plateau,
 * dressé sur son bord haut. À gauche, toujours l'équipe du joueur (« You &
 * Alice », « You » dans l'or de l'étiquette « Teammate » des pastilles) ; à
 * droite, l'équipe adverse en miroir. Chaque équipe a ses billes (les planètes
 * du plateau) dans une alvéole creusée comme les cases : on sait d'un coup
 * d'œil quelles billes sont celles de son allié. En spectateur, rouge et bleu
 * à gauche.
 *
 * La position (base sur le filet du plateau), l'échelle, la largeur max et la
 * visibilité selon l'espace libre sont calculées par
 * `BoardComponent.layoutTeamBanner` (le plateau garde sa taille max).
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
  @HostBinding("style.max-width.px") get maxWidth(): number | null { return this.state.bannerLayout()?.maxWidth ?? null; }
  @HostBinding("style.visibility") get visibility(): string { return this.state.bannerLayout() ? "visible" : "hidden"; }

  /** Équipe rouge + bleu. */
  leftTeam = input.required<ReadonlyArray<TeamIntroPlayer>>();
  /** Équipe vert + orange. */
  rightTeam = input.required<ReadonlyArray<TeamIntroPlayer>>();

  /** L'équipe du joueur (lui d'abord) et l'équipe adverse. */
  readonly sides = computed(() => {
    const me = this.state.myPlayerColor();
    const left = this.leftTeam();
    const right = this.rightTeam();
    const mine = me && right.some((p) => p.color === me) ? right : left;
    const theirs = mine === left ? right : left;
    const seat = (p: TeamIntroPlayer): BannerSeat => ({
      color: p.color,
      isMe: p.color === me,
      label: p.color === me ? "You" : firstName(p),
    });
    const ally = [...mine].sort((a, b) => Number(b.color === me) - Number(a.color === me)).map(seat);
    return { ally, rival: theirs.map(seat) };
  });
}

/** Longueur max d'un nom affiché (l'ellipse comprise) : tient dans le fronton sur un écran étroit. */
const MAX_NAME = 7;

/**
 * Nom court d'un siège. Le prénom s'il tient ; sinon la première partie d'un
 * prénom composé (« Louis-Marie » donne « Louis »), puis le plus court des
 * autres mots du nom ; en dernier recours le prénom coupé avec une ellipse.
 * Sans nom : la couleur du siège.
 */
function firstName(p: TeamIntroPlayer): string {
  const words = (p.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return p.color.charAt(0).toUpperCase() + p.color.slice(1);
  const first = words[0];
  if (first.length <= MAX_NAME) return first;
  const head = first.split(/[-']/)[0];
  if (head.length >= 3 && head.length <= MAX_NAME) return head;
  const others = words.slice(1).filter((w) => w.length >= 3 && w.length <= MAX_NAME).sort((a, b) => a.length - b.length);
  if (others.length > 0) return others[0];
  return first.slice(0, MAX_NAME - 1) + "\u2026";
}
