import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  Input,
  OnDestroy,
  inject,
} from '@angular/core';

/** Animations du trèfle (noms des @keyframes, préfixés par Angular). */
const CLOVER_ANIMATION = /mc-(lap|face)-(red|orange|blue|green)$|mc-(reach|lobe)$/;
/** Le tour de la bille rouge, la première à partir : l'horloge de référence. */
const ANCHOR_ANIMATION = /mc-lap-red$/;

/**
 * Logo vivant : les quatre billes forment le trèfle de l'icône, partent faire
 * un tour de piste chacune son tour, puis reviennent. Interchangeable avec
 * `MarbleOrbitComponent` (l'orrery, gardé en réserve).
 *
 * Le trèfle tient par seize animations CSS de même durée qui doivent rester
 * en phase (arcs du contour, bras, rayons, billes). Sur Android elles se sont
 * décalées, après une partie puis simplement en ouvrant les fenêtres de
 * l'accueil : le contour ne s'emboîtait plus sur les billes. Deux parades :
 * leurs keyframes n'ont plus de variables CSS (voir le SCSS), et le composant
 * les recale sur une même horloge à l'affichage, au retour de l'app au
 * premier plan, puis à chaque tour, quand les quatre billes sont rangées.
 */
@Component({
  selector: 'app-marble-clover',
  standalone: true,
  templateUrl: './marble-clover.component.html',
  styleUrls: ['./marble-clover.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarbleCloverComponent implements AfterViewInit, OnDestroy {
  /** 'lg' = écran de chargement ; 'sm' = page home. Dimensions dans le SCSS (--_d). */
  @Input() size: 'sm' | 'lg' = 'lg';
  @HostBinding('class.sm') get isSm() { return this.size === 'sm'; }
  /** Purement décoratif : ignoré des lecteurs d'écran. */
  @HostBinding('attr.aria-hidden') readonly ariaHidden = 'true';

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private frame = 0;

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') this.scheduleSync();
  };

  /**
   * Fin d'un tour de la bille rouge (son délai est nul) : à cet instant les
   * quatre billes sont dans leur case et le contour est fermé, un recalage
   * ne se voit pas, ou à peine si une animation avait dérivé.
   */
  private readonly onIteration = (event: AnimationEvent) => {
    if (ANCHOR_ANIMATION.test(event.animationName)) this.syncClock(true);
  };

  ngAfterViewInit(): void {
    this.scheduleSync();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.host.addEventListener('animationiteration', this.onIteration);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.host.removeEventListener('animationiteration', this.onIteration);
  }

  /** Au prochain rendu, quand les animations CSS existent toutes. */
  private scheduleSync(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.syncClock(false));
  }

  /**
   * Même heure de départ pour toutes les animations du trèfle : celle de la
   * bille rouge (`onAnchor`), ou maintenant. Le délai de chaque bille (son
   * rang) reste dans sa propre animation. Une animation en pause (écran de
   * chargement masqué) n'est pas touchée : lui donner une heure de départ la
   * relancerait.
   */
  private syncClock(onAnchor: boolean): void {
    if (typeof this.host.getAnimations !== 'function') return;
    const clover = this.host
      .getAnimations({ subtree: true })
      .filter(
        (a): a is CSSAnimation =>
          a instanceof CSSAnimation && CLOVER_ANIMATION.test(a.animationName) && a.playState === 'running'
      );
    const anchor = onAnchor ? clover.find((a) => ANCHOR_ANIMATION.test(a.animationName)) : undefined;
    const start = anchor?.startTime ?? document.timeline?.currentTime;
    if (start == null) return;
    for (const animation of clover) {
      if (animation.startTime !== start) animation.startTime = start;
    }
  }
}
