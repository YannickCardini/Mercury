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
import { NEW_TURN_BANNER_DURATION_MS } from '@mercury/shared';
import { GameStateService } from '../../services/game-state.service';

/** Delay of player inactivity, with no card selected, before the card-usage hint appears. */
const CARD_HINT_DELAY_MS = 15_000;
/** Shorter delay for the discard hint: when the only legal action is to
 *  discard, there's nothing to weigh, so nudge the player sooner. */
const DISCARD_HINT_DELAY_MS = 7_000;
/** Shorter delay for the 'card' hint when the player has no marble in play
 *  at all yet: with nothing else on the board, entering one is the obvious
 *  move, so nudge sooner than the general CARD_HINT_DELAY_MS. */
const EMPTY_BOARD_HINT_DELAY_MS = 8_000;
/** Delay for the 'jack' hint (play a Jack to swap a marble). Longer than the
 *  entry hints: swapping is a secondary option, entering a marble always
 *  takes priority when both are possible (see the `hint` computed). */
const JACK_HINT_DELAY_MS = 20_000;

/** Minimum space (px) a pill needs above its target to sit 'above' it without
 *  its top edge getting clipped by the viewport — a rough estimate of pill
 *  height + arrow + gap, since the real height isn't known until it renders. */
const MIN_PILL_TOP_MARGIN = 100;

/** Which game element a hint refers to. */
type HintAnchor = 'hand' | 'board' | 'confirm' | 'jack' | 'swap-board';

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

/** An inactivity countdown: `elapsed` flips to true `delayMs` after `arm()`,
 *  unless `disarm()` or a fresh `arm()` cancels it first. */
class InactivityTimer {
  readonly elapsed = signal(false);
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delayMs: number) {}

  arm(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.elapsed.set(false);
    this.timeout = setTimeout(() => {
      this.elapsed.set(true);
      this.timeout = null;
    }, this.delayMs);
  }

  disarm(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.elapsed.set(false);
  }
}

/**
 * Contextual, non-blocking guidance overlay for new players.
 * Sits as a fixed sibling over the game UI and shows a single hint
 * derived purely from GameStateService signals. It never blocks
 * interaction (pointer-events: none) and auto-advances/hides as the
 * game state changes.
 *
 * Each hint shows highlight rings around its targets — every card in hand,
 * every playable marble, or the confirm/discard button — plus one text pill
 * with a pointer arrow per target (usually one pill; the Jack swap hints
 * place one per selectable marble). The card rings follow each card's fan
 * rotation. Positions are measured from the real DOM so they track the
 * live layout.
 *
 * Timing models per hint (all gated by the Card Help toggle,
 * GameStateService.cardHelpEnabled):
 * - 'card' (no legal move selected yet, holding a playable A/K/Joker):
 *   appears on any turn, after CARD_HINT_DELAY_MS of inactivity — or the
 *   shorter EMPTY_BOARD_HINT_DELAY_MS when the player has no marble in
 *   play at all yet (nothing else to consider, the obvious move).
 * - 'discard' (no legal move at all): shorter DISCARD_HINT_DELAY_MS delay —
 *   there's nothing to weigh, so nudge sooner.
 * - 'jack' (holding a playable Jack, no better option): longer
 *   JACK_HINT_DELAY_MS delay — entering a marble ('card' above) always
 *   takes priority over swapping when both are possible, since it has the
 *   shorter delay (see the `hint` computed for how that's enforced).
 * - 'marble' / 'jack-source' / 'jack-target' / 'confirm' (a card is already
 *   selected): shown immediately, every turn, no delay — the player is
 *   already mid-move and needs the next-step affordance right away.
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

  /** Set once the local player discards this turn (resets every turn). */
  private hasDiscarded = signal(false);
  /** True between playAction() and the server's actionPlayed echo, to avoid
   *  re-showing the 'card' hint while selections are being cleared. */
  private pendingAction = signal(false);
  /** True while the new-turn banner is on screen; suppresses all hints. */
  private isBannerVisible = signal(false);
  private bannerTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Gates the 'card' hint when a marble is already in play. */
  private cardHintDelay = new InactivityTimer(CARD_HINT_DELAY_MS);
  /** Gates the 'card' hint when the player has no marble in play at all. */
  private emptyBoardHintDelay = new InactivityTimer(EMPTY_BOARD_HINT_DELAY_MS);
  /** Gates the 'discard' hint. */
  private discardHintDelay = new InactivityTimer(DISCARD_HINT_DELAY_MS);
  /** Gates the 'jack' hint. */
  private jackHintDelay = new InactivityTimer(JACK_HINT_DELAY_MS);

  /** True when the server says the player has no legal move and must discard. */
  private isDiscardMode = computed(
    () => this.gameState.data()?.gameState.canDiscard ?? false,
  );

  /** Current hint to display, or null when the overlay should be hidden. */
  hint = computed<Hint | null>(() => {
    const gs = this.gameState;
    if (!gs.cardHelpEnabled()) return null; // bouton menu « Card Help » : coupe tous les hints
    if (this.isBannerVisible()) return null;
    if (gs.teamIntroPlaying()) return null; // pas de hint pendant l'annonce des équipes (2v2)
    if (!gs.isMyTurn()) return null;
    if (this.pendingAction()) return null;

    // No legal move this turn — guide the player to the discard button, once
    // the player has been inactive for a while (shorter delay: there's
    // nothing to weigh, the only legal action is to discard).
    if (this.isDiscardMode()) {
      if (!this.discardHintDelay.elapsed()) return null;
      if (this.hasDiscarded()) return null;
      return { id: 'discard', text: 'No playable cards — tap to discard', anchor: 'confirm' };
    }

    if (!gs.selectedCard()) {
      // Priority: entering a marble always wins over swapping when both are
      // possible — it has the shorter delay (8s/15s vs 20s), so once its
      // condition holds we never fall through to the 'jack' hint below, even
      // if the entry delay itself hasn't elapsed yet.
      if (gs.canEnterMarble()) {
        const delayElapsed = gs.allOwnMarblesAtHome()
          ? this.emptyBoardHintDelay.elapsed()
          : this.cardHintDelay.elapsed();
        if (delayElapsed) {
          return { id: 'card', text: 'Play a King, Ace or Joker to start', anchor: 'hand' };
        }
        return null;
      }
      // Holding a playable Jack — guide the player to swap a marble, once
      // inactive for longer (secondary option vs. entering a marble).
      if (gs.canSwapWithJack() && this.jackHintDelay.elapsed()) {
        return { id: 'jack', text: 'Play Jack to swap a marble', anchor: 'jack' };
      }
      return null;
    }
    // A card is selected — these steps are shown immediately (no delay).
    if (gs.selectedCard()?.value === 'J') {
      // Jack swap flow: pick the source marble, then the target marble.
      if (gs.selectedMarblePosition() === null) {
        return { id: 'jack-source', text: 'Pick a marble', anchor: 'swap-board' };
      }
      if (gs.selectedSwapTargetPosition() === null) {
        return { id: 'jack-target', text: 'Pick a second marble', anchor: 'swap-board' };
      }
    } else if (gs.selectedMarblePosition() === null) {
      // Marble-entry flow only, for now: other playable marbles (already in
      // play) aren't highlighted yet, that's a later evolution.
      if (!gs.hasPlayableHomeMarble()) return null;
      return { id: 'marble', text: 'Select a marble to move', anchor: 'board' };
    }
    if (gs.canPlay()) {
      return { id: 'confirm', text: 'Tap the button to confirm', anchor: 'confirm' };
    }
    return null;
  });

  /** Placement of the text pill(s), recomputed whenever the hint changes.
   *  Usually one pill; the Jack swap hints place one per selectable marble. */
  pills = signal<PillPlacement[]>([]);
  /** Highlight rings to draw around the hint's targets. */
  highlights = signal<HighlightBox[]>([]);

  /** Pill placements exposed to the template. */
  pillPositions = this.pills.asReadonly();

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
    // Echoed-back discard action for the local player: retires the discard
    // hint for the rest of this turn.
    this.gameState.actionPlayed$.pipe(takeUntilDestroyed()).subscribe(action => {
      if (action.playerColor !== this.gameState.myPlayerColor()) return;
      if (action.type === 'discard') this.hasDiscarded.set(true);
    });

    // Suppress the 'card' hint during the server round-trip after the player
    // confirms a move (canPlay flips true → false only when they clicked confirm).
    toObservable(this.gameState.canPlay).pipe(
      pairwise(),
      takeUntilDestroyed(),
    ).subscribe(([prev, curr]) => {
      if (prev && !curr) this.pendingAction.set(true);
    });
    // On every isMyTurn change: reset pendingAction (so a spurious canPlay
    // transition can never block hints across multiple turns), and arm/disarm
    // the inactivity delay for the new turn.
    toObservable(this.gameState.isMyTurn).pipe(takeUntilDestroyed())
      .subscribe(isMine => {
        this.pendingAction.set(false);
        if (isMine) {
          this.hasDiscarded.set(false);
          this.armHintDelay();
        } else {
          this.disarmHintDelay();
        }
      });
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

      // A Joker bonus turn keeps isMyTurn === true across two consecutive
      // turns (no false→true transition), so re-arm here too — otherwise
      // the inactivity delay wouldn't restart for the bonus turn.
      if (this.gameState.isMyTurn()) {
        this.hasDiscarded.set(false);
        this.armHintDelay();
      }
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
    this.disarmHintDelay();
  }

  @HostListener('window:resize')
  onResize(): void {
    const h = this.hint();
    if (h) this.recompute(h.anchor);
  }

  private clear(): void {
    this.pills.set([]);
    this.highlights.set([]);
  }

  /** (Re)starts all inactivity countdowns for a freshly-started local turn. */
  private armHintDelay(): void {
    this.cardHintDelay.arm();
    this.emptyBoardHintDelay.arm();
    this.discardHintDelay.arm();
    this.jackHintDelay.arm();
  }

  /** Cancels all inactivity countdowns once it's no longer the local player's turn. */
  private disarmHintDelay(): void {
    this.cardHintDelay.disarm();
    this.emptyBoardHintDelay.disarm();
    this.discardHintDelay.disarm();
    this.jackHintDelay.disarm();
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
      this.pills.set([{ left: u.cx, top: anchorTop, side: 'above', arrowShift: 0 }]);
    } else if (anchor === 'jack') {
      // Point at one Jack card in hand (the first one, if several — doesn't
      // matter which). `.playable-card` elements follow the same order as
      // `hand`, no sort/filter in between (same assumption already relied on
      // by table.component.ts for selectedCardIndex). No ring, like 'hand'
      // above: hovering lifts the card via a CSS transition, and a ring
      // measured once here would lag behind and drift off the card.
      const hand = this.gameState.data()?.gameState.hand ?? [];
      const idx = hand.findIndex(c => c.value === 'J');
      const cards = document.querySelectorAll<HTMLElement>('.playable-card');
      const el = idx >= 0 ? cards[idx] : undefined;
      if (!el) return this.clear();
      const box = this.orientedBox(el, 'card');
      this.highlights.set([]);
      this.pills.set([{ left: box.cx, top: box.cy - box.height / 2, side: 'above', arrowShift: 0 }]);
    } else if (anchor === 'confirm') {
      // Outline the confirm/discard button; place the pill above it.
      const btn = document.querySelector<HTMLElement>('.action-btn');
      if (!btn) return this.clear();
      const box = this.orientedBox(btn, 'button');
      this.highlights.set([box]);
      this.pills.set([{ left: box.cx, top: box.cy - box.height / 2, side: 'above', arrowShift: 0 }]);
    } else if (anchor === 'swap-board') {
      // Jack swap flow (source or target step) — outline every selectable
      // marble, unrestricted (unlike 'board' below, marbles already in play
      // are exactly what's relevant here), with one pill per marble. Marbles
      // can sit anywhere on the board, including near the very top edge, so
      // each pill individually flips below its marble (arrow pointing up)
      // instead of above whenever there isn't enough headroom — a fixed
      // 'above' would otherwise get clipped by the top of the viewport.
      const marbles = Array.from(document.querySelectorAll<HTMLElement>('.marble-selectable'));
      if (!marbles.length) return this.clear();
      const boxes = marbles.map(el => this.orientedBox(el, 'marble'));
      this.highlights.set(boxes);
      this.pills.set(boxes.map(box => {
        const top = box.cy - box.height / 2;
        return top >= MIN_PILL_TOP_MARGIN
          ? { left: box.cx, top, side: 'above' as const, arrowShift: 0 }
          : { left: box.cx, top: box.cy + box.height / 2, side: 'below' as const, arrowShift: 0 };
      }));
    } else {
      // 'board' — outline the selectable marble(s) still in the home reserve;
      // place the pill just outside the player's home corner. Only the entry
      // move is hinted for now (gated by hasPlayableHomeMarble), so marbles
      // already in play (also selectable with some cards) are deliberately
      // left out. `.home` (not `.home-<color>`) so this also matches the
      // teammate's home in a 2v2 forced-solidaire entry.
      const allSelectable = Array.from(document.querySelectorAll<HTMLElement>('.marble-selectable'));
      const marbles = allSelectable.filter(el => el.closest('.home'));
      if (!marbles.length) return this.clear();
      this.highlights.set(marbles.map(el => this.orientedBox(el, 'marble')));
      const myColor = this.gameState.myPlayerColor();
      const homeEls = myColor
        ? Array.from(document.querySelectorAll<HTMLElement>(`.home-${myColor}`))
        : [];
      const ref = homeEls.length ? this.unionRect(homeEls) : this.unionRect(marbles);
      // Always place the pill just below the home cluster (arrow points up toward
      // the marble). Works for all player positions without overflowing the viewport.
      this.pills.set([{
        left: ref.cx,
        top: ref.bottom,
        side: 'below',
        arrowShift: 0,
      }]);
    }

    // Once the pills have rendered, keep them inside the viewport.
    requestAnimationFrame(() => this.clampPillsIntoViewport());
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
   * Shifts each pill horizontally so it never overflows the screen edge, and
   * offsets its arrow by the same amount so it still points at its target.
   * `.hint-pill` elements are produced in the same order as `pills()` (the
   * template `@for`s over it), so they're matched up by index.
   */
  private clampPillsIntoViewport(): void {
    const current = this.pills();
    if (!current.length) return;
    const pillEls = document.querySelectorAll<HTMLElement>('.hint-pill');
    if (!pillEls.length) return;

    const margin = 8;
    let changed = false;
    const next = current.map((p, i) => {
      const pillEl = pillEls[i];
      if (!pillEl) return p;
      const halfWidth = pillEl.offsetWidth / 2;
      const targetLeft = p.left + p.arrowShift; // original, un-clamped centre
      const clampedLeft = Math.min(
        Math.max(targetLeft, halfWidth + margin),
        window.innerWidth - halfWidth - margin,
      );
      const arrowShift = targetLeft - clampedLeft;
      if (clampedLeft !== p.left || arrowShift !== p.arrowShift) changed = true;
      return { ...p, left: clampedLeft, arrowShift };
    });
    if (changed) this.pills.set(next);
  }
}
