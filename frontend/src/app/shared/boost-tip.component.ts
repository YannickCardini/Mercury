import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
} from "@angular/core";
import type { ConsumableShopItem } from "@mercury/shared";

/** Marge gardée entre la bulle et le bord de ce qui la contient. */
const EDGE = 8;
/**
 * Grâce avant de refermer quand la souris sort : passer du creux à sa croix
 * (ou effleurer le bord) ne fait pas clignoter la bulle.
 */
const LEAVE_GRACE_MS = 80;

/** L'infobulle ouverte : une seule à la fois, ouvrir l'une ferme l'autre. */
let current: BoostTipComponent | null = null;

let seq = 0;

/**
 * Infobulle d'un booster : son nom et son effet, au-dessus de ce qu'elle
 * enveloppe (un jeton, un creux). Elle s'ouvre au survol de la souris, au
 * toucher sur mobile et tablette (un second toucher la referme), et au focus
 * du clavier ; toucher ailleurs ou Échap la ferme.
 *
 * La bulle reste dans le flux de son hôte (pas de calque hors de la page) et
 * se recale à l'ouverture : décalée pour ne pas sortir de ce qui la rogne,
 * et posée dessous s'il n'y a pas la place au-dessus.
 */
@Component({
  selector: "app-boost-tip",
  template: `
    <button type="button" class="tip-trigger"
            [attr.aria-label]="boost().label"
            [attr.aria-describedby]="open() ? id : null"
            (pointerdown)="onPointerDown($event)"
            (pointerenter)="onEnter($event)"
            (pointerleave)="onLeave($event)"
            (click)="onClick()"
            (focus)="onFocus()"
            (blur)="hide()">
      <ng-content />
    </button>
    @if (open()) {
      <span class="tip" role="tooltip" [id]="id" [attr.data-effect]="boost().effect"
            [class.is-below]="below()" [class.is-placed]="placed()"
            [style.--tip-shift]="shift() + 'px'">
        <span class="tip-name">{{ boost().label }}</span>
        <span class="tip-desc">{{ boost().description }}</span>
        <span class="tip-arrow" aria-hidden="true"></span>
      </span>
    }
  `,
  styleUrl: "./boost-tip.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "(document:pointerdown)": "onDocumentPointerDown($event)",
    "(document:keydown.escape)": "hide()",
  },
})
export class BoostTipComponent {
  boost = input.required<ConsumableShopItem>();

  readonly id = `boost-tip-${++seq}`;
  readonly open = signal(false);
  readonly below = signal(false);
  readonly shift = signal(0);
  /** Mesurée et recalée : visible seulement à partir de là, sans saut. */
  readonly placed = signal(false);

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);
  /** Type du dernier appui, pour distinguer souris (survol) et toucher (bascule). */
  private pointer: string | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.cancelLeave();
      if (current === this) current = null;
    });
  }

  onPointerDown(event: PointerEvent): void {
    this.pointer = event.pointerType;
  }

  onEnter(event: PointerEvent): void {
    if (event.pointerType !== "mouse") return;
    this.cancelLeave();
    this.show();
  }

  onLeave(event: PointerEvent): void {
    if (event.pointerType !== "mouse") return;
    this.cancelLeave();
    this.leaveTimer = setTimeout(() => {
      this.leaveTimer = null;
      this.hide();
    }, LEAVE_GRACE_MS);
  }

  onClick(): void {
    // Souris : le survol l'a déjà ouverte, le clic la garde. Toucher : bascule.
    if (this.pointer === "mouse") this.show();
    else if (this.open()) this.hide();
    else this.show();
    this.pointer = null;
  }

  /** Focus venu du clavier seulement : celui d'un toucher est suivi d'un clic. */
  onFocus(): void {
    if (this.pointer === null) this.show();
  }

  onDocumentPointerDown(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.hide();
  }

  show(): void {
    if (this.open()) return;
    if (current && current !== this) current.hide();
    current = this;
    this.below.set(false);
    this.shift.set(0);
    this.placed.set(false);
    this.open.set(true);
    // Après le rendu qui crée la bulle : l'app regroupe ses rendus à l'image
    // suivante (eventCoalescing), un requestAnimationFrame lancé ici passerait
    // avant elle et ne trouverait rien à mesurer.
    afterNextRender(() => this.place(), { injector: this.injector });
  }

  hide(): void {
    this.cancelLeave();
    if (!this.open()) return;
    this.open.set(false);
    if (current === this) current = null;
  }

  private cancelLeave(): void {
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
  }

  /** Recale la bulle dans ce qui la contient : à gauche, à droite, en haut. */
  private place(): void {
    const tip = this.host.nativeElement.querySelector<HTMLElement>(".tip");
    if (!tip || !this.open()) return;
    const bound = clippingRect(this.host.nativeElement);
    const r = tip.getBoundingClientRect();
    let shift = 0;
    if (r.left < bound.left + EDGE) shift = bound.left + EDGE - r.left;
    else if (r.right > bound.right - EDGE) shift = bound.right - EDGE - r.right;
    this.shift.set(shift);
    this.below.set(r.top < bound.top + EDGE);
    this.placed.set(true);
  }
}

/**
 * Rectangle visible autour d'un élément : celui du premier ancêtre qui rogne
 * son contenu (overflow autre que visible), borné par l'écran.
 */
function clippingRect(el: HTMLElement): { left: number; right: number; top: number } {
  let left = 0;
  let right = window.innerWidth;
  let top = 0;
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      const r = node.getBoundingClientRect();
      left = Math.max(left, r.left);
      right = Math.min(right, r.right);
      top = Math.max(top, r.top);
      break;
    }
  }
  return { left, right, top };
}
