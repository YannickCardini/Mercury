import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { pairwise } from 'rxjs';
import { NEW_TURN_BANNER_DURATION_MS, getHomePositions } from '@mercury/shared';
import { GameStateService } from '../../services/game-state.service';

/** Which game element a hint refers to. */
type HintAnchor = 'hand' | 'board' | 'confirm';

/** Visual style of a highlight outline. */
type HighlightShape = 'card' | 'marble' | 'button';

interface Hint {
  id: string;
  text: string;
  anchor: HintAnchor;
}

/** A highlight ring, centred on (cx, cy) and rotated to match its target. */
interface HighlightBox {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
  shape: HighlightShape;
}

interface PillPlacement {
  /** Clamped centre X of the pill. */
  left: number;
  /** Y of the target edge the pill attaches to. */
  top: number;
  /** Which side of `top` the pill body sits on. */
  side: 'above' | 'below';
  /** Horizontal arrow offset that re-aims it at the target after clamping. */
  arrowShift: number;
}

/** Axis-aligned union of several elements' bounding rects. */
interface UnionRect {
  top: number;
  bottom: number;
  cx: number;
  cy: number;
}

/**
 * Contextual, non-blocking guidance overlay for new players.
 * Sits as a fixed sibling over the game UI and shows a single hint
 * derived purely from GameStateService signals. It never blocks
 * interaction (pointer-events: none) and auto-advances/hides as the
 * game state changes.
 *
 * Each hint shows a text pill with a pointer arrow plus highlight rings
 * around the relevant targets — every card in hand, every playable
 * marble, or the confirm/discard button. The card rings follow each
 * card's fan rotation. Positions are measured from the real DOM so they
 * track the live layout.
 *
 * The move-flow hints stop once the player confirms their first move;
 * the discard hint stops once they discard for the first time.
 *
 * To add a hint step: add one entry to the `hint` state machine and a
 * matching branch in `recompute`.
 */
@Component({
  selector: 'app-tutorial-overlay',
  standalone: true,
  templateUrl: './tutorial-overlay.component.html',
  styleUrls: ['./tutorial-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorialOverlayComponent implements OnDestroy {
  private gameState = inject(GameStateService);

  /** Set once the local player confirms a real move (never for a discard). */
  private hasConfirmed = signal(false);
  /** Set once the local player discards for the first time. */
  private hasDiscarded = signal(false);
  /** True between playAction() and the server's actionPlayed echo, to avoid
   *  re-showing the 'card' hint while selections are being cleared. */
  private pendingAction = signal(false);
  /** True while the new-turn banner is on screen; suppresses all hints. */
  private isBannerVisible = signal(false);
  private bannerTimeout: ReturnType<typeof setTimeout> | null = null;

  /** True when the server says the player has no legal move and must discard. */
  private isDiscardMode = computed(
    () => this.gameState.data()?.gameState.canDiscard ?? false,
  );

  /** Current hint to display, or null when the overlay should be hidden. */
  hint = computed<Hint | null>(() => {
    const gs = this.gameState;
    if (this.isBannerVisible()) return null;
    if (!gs.isMyTurn()) return null;

    // No legal move this turn — guide the player to the discard button.
    if (this.isDiscardMode()) {
      if (this.hasDiscarded()) return null;
      return { id: 'discard', text: 'No playable cards — tap to discard', anchor: 'confirm' };
    }

    if (this.hasConfirmed() || this.pendingAction()) return null;

    if (!gs.selectedCard()) {
      return { id: 'card', text: 'Play a King, Ace or Joker to start', anchor: 'hand' };
    }
    if (gs.selectedMarblePosition() === null) {
      return { id: 'marble', text: 'Select a marble to move', anchor: 'board' };
    }
    if (gs.canPlay()) {
      return { id: 'confirm', text: 'Tap the button to confirm', anchor: 'confirm' };
    }
    return null;
  });

  /** Placement of the text pill, recomputed whenever the hint changes. */
  pill = signal<PillPlacement | null>(null);
  /** Highlight rings to draw around the hint's targets. */
  highlights = signal<HighlightBox[]>([]);

  /** Pill placement exposed to the template. */
  pillPosition = this.pill.asReadonly();

  /** Highlight rects in template-friendly form. */
  highlightRects = computed(() =>
    this.highlights().map(h => ({
      left: h.cx - h.width / 2,
      top: h.cy - h.height / 2,
      width: h.width,
      height: h.height,
      rotation: h.rotation,
    }))
  );

  constructor() {
    // Echoed-back actions for the local player: 'move' = a confirmed move,
    // 'discard' = a discard. Each retires its own hint family.
    this.gameState.actionPlayed$.pipe(takeUntilDestroyed()).subscribe(action => {
      if (action.playerColor !== this.gameState.myPlayerColor()) return;
      if (action.type === 'discard') this.hasDiscarded.set(true);
      else this.hasConfirmed.set(true);
    });

    // On reconnection to an already-started game the component re-creates with
    // hasConfirmed = false, but the player may already have marbles on the board.
    // Detect this by checking whether any marble sits outside the home zone and,
    // if so, permanently suppress the first-move hint flow.
    effect(() => {
      if (this.hasConfirmed()) return;
      const data = this.gameState.data();
      const myColor = this.gameState.myPlayerColor();
      if (!data || !myColor) return;
      const player = data.gameState.players.find(p => p.color === myColor);
      if (!player) return;
      const homePositions = getHomePositions(myColor);
      if (player.marblePositions.some(pos => !homePositions.includes(pos))) {
        this.hasConfirmed.set(true);
      }
    });

    // Suppress the 'card' hint during the server round-trip after the player
    // confirms a move (canPlay flips true → false only when they clicked confirm).
    toObservable(this.gameState.canPlay).pipe(
      pairwise(),
      takeUntilDestroyed(),
    ).subscribe(([prev, curr]) => {
      if (prev && !curr) this.pendingAction.set(true);
    });
    // Reset pendingAction on EVERY isMyTurn change (both start and end of turn)
    // so a spurious canPlay transition can never block hints across multiple turns.
    toObservable(this.gameState.isMyTurn).pipe(takeUntilDestroyed())
      .subscribe(() => this.pendingAction.set(false));
    this.gameState.actionRejected$.pipe(takeUntilDestroyed())
      .subscribe(() => this.pendingAction.set(false));

    this.gameState.newTurn.pipe(takeUntilDestroyed()).subscribe(val => {
      if (!val) return;
      if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
      this.isBannerVisible.set(true);
      this.bannerTimeout = setTimeout(() => {
        this.isBannerVisible.set(false);
        this.bannerTimeout = null;
      }, NEW_TURN_BANNER_DURATION_MS);
    });

    effect(() => {
      const h = this.hint();
      // Publish the active hint id so other components (e.g. the card-effect
      // hint) can avoid overlapping with the tutorial.
      this.gameState.tutorialHintId.set(h?.id ?? null);
      if (!h) {
        this.clear();
        return;
      }
      // Defer one frame so the target elements' layout is settled.
      requestAnimationFrame(() => this.recompute(h.anchor));
    });
  }

  ngOnDestroy(): void {
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
  }

  @HostListener('window:resize')
  onResize(): void {
    const h = this.hint();
    if (h) this.recompute(h.anchor);
  }

  private clear(): void {
    this.pill.set(null);
    this.highlights.set([]);
  }

  private recompute(anchor: HintAnchor): void {
    if (anchor === 'hand') {
      // No highlight on cards — just position the pill above the center card.
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.playable-card'));
      if (!cards.length) return this.clear();
      this.highlights.set([]);
      const u = this.unionRect(cards);
      let bestDist = Infinity;
      let anchorTop = u.top;
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const dist = Math.abs(rect.left + rect.width / 2 - u.cx);
        if (dist < bestDist) { bestDist = dist; anchorTop = rect.top; }
      }
      this.pill.set({ left: u.cx, top: anchorTop, side: 'above', arrowShift: 0 });
    } else if (anchor === 'confirm') {
      // Outline the confirm/discard button; place the pill above it.
      const btn = document.querySelector<HTMLElement>('.action-btn');
      if (!btn) return this.clear();
      const box = this.orientedBox(btn, 'button');
      this.highlights.set([box]);
      this.pill.set({ left: box.cx, top: box.cy - box.height / 2, side: 'above', arrowShift: 0 });
    } else {
      // 'board' — outline the selectable marble; place the pill just outside
      // the player's home corner (the only selectable spot on the first turn).
      const marbles = Array.from(document.querySelectorAll<HTMLElement>('.marble-selectable'));
      if (!marbles.length) return this.clear();
      this.highlights.set(marbles.map(el => this.orientedBox(el, 'marble')));
      const myColor = this.gameState.myPlayerColor();
      const homeEls = myColor
        ? Array.from(document.querySelectorAll<HTMLElement>(`.home-${myColor}`))
        : [];
      const ref = homeEls.length ? this.unionRect(homeEls) : this.unionRect(marbles);
      // Always place the pill just below the home cluster (arrow points up toward
      // the marble). Works for all player positions without overflowing the viewport.
      this.pill.set({
        left: ref.cx,
        top: ref.bottom,
        side: 'below',
        arrowShift: 0,
      });
    }

    // Once the pill has rendered, keep it inside the viewport.
    requestAnimationFrame(() => this.clampPillIntoViewport());
  }

  /** Builds a centre-anchored highlight box, matching the element's rotation. */
  private orientedBox(el: HTMLElement, shape: HighlightShape): HighlightBox {
    const r = el.getBoundingClientRect();
    let rotation = 0;
    let width = r.width;
    let height = r.height;
    if (shape === 'card') {
      // Cards are fanned with a CSS rotate(); use the un-rotated layout size
      // and re-apply the rotation so the ring hugs the card.
      width = el.offsetWidth;
      height = el.offsetHeight;
      const transform = getComputedStyle(el).transform;
      if (transform && transform !== 'none') {
        const m = new DOMMatrixReadOnly(transform);
        rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
      }
    }
    // The AABB of any rotated rectangle is centred on the rectangle's centre.
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      width,
      height,
      rotation,
      shape,
    };
  }

  private unionRect(els: HTMLElement[]): UnionRect {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    return { top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
  }

  /**
   * Shifts the pill horizontally so it never overflows the screen edge, and
   * offsets the arrow by the same amount so it still points at the target.
   */
  private clampPillIntoViewport(): void {
    const p = this.pill();
    const pillEl = document.querySelector<HTMLElement>('.hint-pill');
    if (!p || !pillEl) return;

    const halfWidth = pillEl.offsetWidth / 2;
    const margin = 8;
    const targetLeft = p.left + p.arrowShift; // original, un-clamped centre
    const clampedLeft = Math.min(
      Math.max(targetLeft, halfWidth + margin),
      window.innerWidth - halfWidth - margin,
    );
    const arrowShift = targetLeft - clampedLeft;
    if (clampedLeft !== p.left || arrowShift !== p.arrowShift) {
      this.pill.set({ ...p, left: clampedLeft, arrowShift });
    }
  }
}
