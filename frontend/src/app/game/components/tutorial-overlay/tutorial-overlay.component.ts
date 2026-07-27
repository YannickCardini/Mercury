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
import { ENTER_CARDS, NEW_TURN_BANNER_DURATION_MS } from '@mercury/shared';
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
/** Delay for the generic 'select-card' fallback hint: shown only once none
 *  of the more specific pre-selection hints apply, so it has the longest
 *  delay of the bunch (lowest priority). */
const SELECT_CARD_HINT_DELAY_MS = 21_000;

/** Gap (px) between a marble's highlight ring and the standalone arrow
 *  pointing down at it (see 'swap-board' in `recompute`). */
const MARBLE_ARROW_GAP = 10;

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
  /** Y of the target edge the pill attaches to ('above'/'below'), or the Y
   *  it's centred on ('center'). */
  top: number;
  /** Which side of `top` the pill body sits on, or 'center' to sit right on
   *  the point (used for the single board-centred pill). */
  side: 'above' | 'below' | 'center';
  /** Horizontal arrow offset that re-aims it at the target after clamping. */
  arrowShift: number;
}

/** Position of a small standalone arrow pointing down at one marble — used
 *  instead of a per-marble pill when several marbles share a single,
 *  board-centred text pill (see 'swap-board' in `recompute`). */
interface MarbleArrow {
  left: number;
  top: number;
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

  constructor(private readonly delayMs: number) { }

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
 * every playable marble, or the confirm/discard button — plus a single text
 * pill with a pointer arrow. Hints that target multiple marbles at once (the
 * Jack swap steps, the generic marble-selection fallback) still ring every
 * one of them, but the pill itself appears only once, centred on the board,
 * rather than once per marble — a pill pointing at nothing in particular
 * would be confusing, so it drops its own arrow and each ringed marble gets
 * a small standalone arrow instead (see `marbleArrows`). The card rings
 * follow each card's fan rotation. Positions are measured from the real DOM
 * so they track the live layout.
 *
 * Every hint belongs to one of three flows — entry (K/A/Joker), swap
 * (Jack), or the generic fallback (any other card) — plus 'discard', which
 * stands on its own. Each flow is gated behind a SINGLE inactivity timer
 * (armed at turn start) covering all of its steps, from the pre-selection
 * hint through to 'confirm': a fast player who picks a card before that
 * timer elapses doesn't get a hint suddenly interrupting them mid-move —
 * every later step of that flow stays silent until the same delay is up.
 * All hints are also gated by the Card Help toggle
 * (GameStateService.cardHelpEnabled):
 * - Entry ('card' → 'marble' → 'confirm'): CARD_HINT_DELAY_MS, or the
 *   shorter EMPTY_BOARD_HINT_DELAY_MS when the player has no marble in play
 *   at all yet (nothing else to consider, the obvious move).
 * - Discard ('discard'): shorter DISCARD_HINT_DELAY_MS — there's nothing to
 *   weigh, the only legal action is to discard.
 * - Swap ('jack' → 'jack-source' → 'jack-target' → 'confirm'):
 *   JACK_HINT_DELAY_MS — entry always takes priority over swap when both
 *   are possible, since it has the shorter delay (see the `hint` computed
 *   for how that's enforced).
 * - Generic fallback ('select-card' → 'select-marble' → 'confirm'):
 *   SELECT_CARD_HINT_DELAY_MS, the longest — lowest priority of the
 *   pre-selection hints. Exception: a 7 that can be split across two
 *   marbles has its own dedicated overlay/hints (table.component.ts) —
 *   'select-marble' stays silent for it.
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
  /** Gates the generic 'select-card' fallback hint. */
  private selectCardHintDelay = new InactivityTimer(SELECT_CARD_HINT_DELAY_MS);

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

    // Each flow (entry / swap / generic) is gated behind ONE inactivity
    // timer that covers every one of its steps, not just the first. If a
    // fast player selects a card before that timer elapses, later steps
    // (marble, confirm) stay just as silent as the pre-selection hint would
    // have been — instead of suddenly popping up mid-move the instant a
    // card is picked.
    const entryDelayElapsed = gs.allOwnMarblesAtHome()
      ? this.emptyBoardHintDelay.elapsed()
      : this.cardHintDelay.elapsed();

    const card = gs.selectedCard();
    if (!card) {
      // Priority: entering a marble always wins over swapping when both are
      // possible — it has the shorter delay (8s/15s vs 20s), so once its
      // condition holds we never fall through to the 'jack' hint below, even
      // if the entry delay itself hasn't elapsed yet.
      if (gs.canEnterMarble()) {
        return entryDelayElapsed
          ? { id: 'card', text: 'Play a King, Ace or Joker to start', anchor: 'hand' }
          : null;
      }
      // Holding a playable Jack — guide the player to swap a marble, once
      // inactive for longer (secondary option vs. entering a marble). Same
      // priority rule: blocks the generic 'select-card' fallback below while
      // this condition holds, even before its own delay has elapsed.
      if (gs.canSwapWithJack()) {
        return this.jackHintDelay.elapsed()
          ? { id: 'jack', text: 'Play Jack to swap a marble', anchor: 'jack' }
          : null;
      }
      // Fallback: no specific hint applies — just point at the hand, once
      // inactive for even longer (lowest priority of the pre-selection hints).
      return this.selectCardHintDelay.elapsed()
        ? { id: 'select-card', text: 'Select a card', anchor: 'hand' }
        : null;
    }

    // A card is already selected — figure out which flow it belongs to, and
    // gate every remaining step (including 'confirm' below) behind that
    // same flow's timer.
    if (card.value === 'J') {
      if (!this.jackHintDelay.elapsed()) return null;
      if (gs.selectedMarblePosition() === null) {
        return { id: 'jack-source', text: 'Pick a marble', anchor: 'swap-board' };
      }
      if (gs.selectedSwapTargetPosition() === null) {
        return { id: 'jack-target', text: 'Pick a second marble', anchor: 'swap-board' };
      }
    } else if (
      gs.hasPlayableHomeMarble()
      // hasPlayableHomeMarble() flips back to false the instant a marble is
      // picked (playableMarblePositions() empties out once selected) — once
      // already committed to the entry flow, stay on it by card type instead,
      // so 'confirm' keeps using this flow's (already-elapsed) entryDelayElapsed
      // instead of falling through to the generic fallback's much longer delay.
      || (gs.selectedMarblePosition() !== null && ENTER_CARDS.includes(card.value))
    ) {
      if (!entryDelayElapsed) return null;
      if (gs.selectedMarblePosition() === null) {
        return { id: 'marble', text: 'Select a marble to move', anchor: 'board' };
      }
    } else {
      if (!this.selectCardHintDelay.elapsed()) return null;
      if (gs.selectedMarblePosition() === null) {
        // A splittable 7 has its own dedicated overlay and hint text
        // (table.component.ts) — don't compete with it.
        if (card.value === '7' && gs.canSplit7Anywhere()) return null;
        return { id: 'select-marble', text: 'Select a marble', anchor: 'swap-board' };
      }
    }
    if (gs.canPlay()) {
      return { id: 'confirm', text: 'Tap the button to confirm', anchor: 'confirm' };
    }
    return null;
  });

  /** Placement of the text pill(s), recomputed whenever the hint changes.
   *  Always a single pill. */
  pills = signal<PillPlacement[]>([]);
  /** Highlight rings to draw around the hint's targets. */
  highlights = signal<HighlightBox[]>([]);
  /** Standalone arrows, one per marble — used only for 'swap-board' (see
   *  `recompute`), where the single text pill has no arrow of its own since
   *  it isn't pointing at any one target. */
  marbleArrows = signal<MarbleArrow[]>([]);

  /** Pill placements exposed to the template. */
  pillPositions = this.pills.asReadonly();
  /** Marble arrow placements exposed to the template. */
  marbleArrowPositions = this.marbleArrows.asReadonly();

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
    this.marbleArrows.set([]);
  }

  /** (Re)starts all inactivity countdowns for a freshly-started local turn. */
  private armHintDelay(): void {
    this.cardHintDelay.arm();
    this.emptyBoardHintDelay.arm();
    this.discardHintDelay.arm();
    this.jackHintDelay.arm();
    this.selectCardHintDelay.arm();
  }

  /** Cancels all inactivity countdowns once it's no longer the local player's turn. */
  private disarmHintDelay(): void {
    this.cardHintDelay.disarm();
    this.emptyBoardHintDelay.disarm();
    this.discardHintDelay.disarm();
    this.jackHintDelay.disarm();
    this.selectCardHintDelay.disarm();
  }

  private recompute(anchor: HintAnchor): void {
    // Only 'swap-board' uses standalone per-marble arrows; every other
    // anchor's pill points at its own single target.
    this.marbleArrows.set([]);
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
      // Jack swap flow (source or target step) or the generic fallback —
      // outline every selectable marble, unrestricted (unlike 'board' below,
      // marbles already in play are exactly what's relevant here). A single
      // pill, centred on the board, carries the text — one per marble would
      // clutter the board once several marbles are selectable at once. A
      // pill pointing nowhere in particular is confusing though, so instead
      // each marble gets its own small standalone arrow (no pill/text).
      const marbles = Array.from(document.querySelectorAll<HTMLElement>('.marble-selectable'));
      if (!marbles.length) return this.clear();
      const boxes = marbles.map(el => this.orientedBox(el, 'marble'));
      this.highlights.set(boxes);
      this.marbleArrows.set(boxes.map(b => ({
        left: b.cx,
        top: b.cy - b.height / 2 - MARBLE_ARROW_GAP,
      })));
      const board = document.querySelector<HTMLElement>('.board-container');
      const ref = board ? this.unionRect([board]) : this.unionRect(marbles);
      this.pills.set([{ left: ref.cx, top: ref.cy, side: 'center', arrowShift: 0 }]);
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
