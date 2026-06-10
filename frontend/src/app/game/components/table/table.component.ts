import { CommonModule } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter
} from '@angular/core';
import { TockCardComponent } from 'src/app/shared/tock-card.component';
import { getCardEffect } from 'src/app/shared/card-effects';
import { EmojiReactionsComponent } from '../emoji-reactions/emoji-reactions.component';
import type { Card, MarbleColor } from '@mercury/shared';
import { getValidSevenStepsForMarble, getPositionAfterMove, getLegalSplit7Action, type LegalMoveContext } from '@mercury/shared';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { SoundService } from '../../services/sound.service';
import { AuthService } from 'src/app/services/auth.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

enum TURN_PHASE {
  DISCARD = "No playable moves",
  CARD = "Choose a card",
  MARBLE = "Choose a Marble",
  SWAP_TARGET = "Choose a target marble",
  SEVEN_SPLIT = "Choose a second marble",
  WAIT = "Wait for your turn",
  CONFIRM = "Confirm your move",
}

@Component({
  selector: 'app-table',
  templateUrl: 'table.component.html',
  styleUrl: 'table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, TockCardComponent, EmojiReactionsComponent]
}) export class TableComponent implements OnInit, OnDestroy {


  /** Circonférence du cercle SVG (rayon = 27.5) */
  readonly timerCircumference = 2 * Math.PI * 27.5; // ≈ 172.79
  timeLeft = this.gameStateService.timeLeft;
  timerInterval?: any; // Type 'any' pour setInterval --- IGNORE ---

  // ── Signaux UI ─────────────────────────────────────────────────
  selectedCardIndex = signal<number | null>(null);
  flyingCardIndex = signal<number | null>(null);
  turnPhase = signal<string>('Choose a card');

  /** Vrai quand le Jack est sélectionné et que la bille propre est choisie mais pas encore la cible. */
  isJackWaitingForTarget = computed(() =>
    this.gameStateService.selectedCard()?.value === 'J' &&
    this.gameStateService.selectedMarblePosition() !== null &&
    !this.gameStateService.canPlay()
  );

  /** Vrai quand l'overlay de sélection du 7 doit être affiché (carte 7 sélectionnée + au moins un split légal possible). */
  showSevenSplitOverlay = computed(() =>
    this.gameStateService.isMyTurn() &&
    this.gameStateService.selectedCard()?.value === '7' &&
    this.gameStateService.canSplit7Anywhere()
  );

  /** Texte d'aide contextuel affiché à chaque étape du flux du 7 (null = masqué). */
  sevenHintText = computed<string | null>(() => {
    if (!this.gameStateService.isMyTurn()) return null;
    if (this.gameStateService.selectedCard()?.value !== '7') return null;
    const marble1 = this.gameStateService.selectedMarblePosition();
    if (marble1 === null) return 'Tap one of your marbles to play the 7';
    if (this.gameStateService.sevenFirstSteps() === 7) {
      return this.validSplitSevenSteps().length > 0
        ? 'Drag the bar to split the 7 across two marbles'
        : null;
    }
    if (this.gameStateService.selectedSplit7MarblePosition() === null) {
      return 'Tap a second marble (gold) for the remaining steps';
    }
    return 'Hit Confirm to play your split';
  });

  /** Vrai quand le split du 7 est entièrement défini et qu'il ne reste plus qu'à confirmer. */
  isSevenSplitReady = computed(() =>
    this.gameStateService.isMyTurn() &&
    this.gameStateService.selectedCard()?.value === '7' &&
    this.gameStateService.sevenFirstSteps() < 7 &&
    this.gameStateService.selectedSplit7MarblePosition() !== null &&
    this.gameStateService.canPlay()
  );

  /** Vrai quand le raccourci "tout sur le premier pion" doit être proposé. */
  showUseAllSevenShortcut = computed(() =>
    this.gameStateService.isMyTurn() &&
    this.gameStateService.selectedCard()?.value === '7' &&
    this.gameStateService.selectedMarblePosition() !== null &&
    this.gameStateService.sevenFirstSteps() < 7 &&
    this.gameStateService.selectedSplit7MarblePosition() === null &&
    this.validSevenSteps().includes(7)
  );

  /** Vrai pendant que l'utilisateur fait glisser la barre de split. */
  isDraggingSplit = signal(false);
  private splitPointerId: number | null = null;

  /** Pas valides (1–7) pour le premier pion sélectionné avec le 7. */
  validSevenSteps = computed<number[]>(() => {
    const marble1 = this.gameStateService.selectedMarblePosition();
    if (marble1 === null) return [];
    const myColor = this.gameStateService.myPlayerColor();
    const data = this.gameStateService.data();
    if (!myColor || !data) return [];
    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return [];
    const marblesByColor = Object.fromEntries(data.gameState.players.map(p => [p.color, p.marblePositions])) as Record<MarbleColor, number[]>;
    const invincibleMarblesByColor = Object.fromEntries(
      data.gameState.players.map(p => [p.color, p.marblePositions.filter((_, i) => p.marbleInvincible[i])])
    ) as Record<MarbleColor, number[]>;
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
      marblesByColor,
      invincibleMarblesByColor,
    };
    return getValidSevenStepsForMarble(marble1, ctx);
  });

  /**
   * Pas valides pour un split (1–6) : le premier pion peut avancer de i pas
   * ET il existe au moins un second pion pouvant avancer de 7-i pas.
   */
  validSplitSevenSteps = computed<number[]>(() => {
    const marble1 = this.gameStateService.selectedMarblePosition();
    if (marble1 === null) return [];
    const card = this.gameStateService.selectedCard();
    if (!card || card.value !== '7') return [];
    const myColor = this.gameStateService.myPlayerColor();
    const data = this.gameStateService.data();
    if (!myColor || !data) return [];
    const player = data.gameState.players.find(p => p.color === myColor);
    if (!player) return [];
    const marblesByColor = Object.fromEntries(data.gameState.players.map(p => [p.color, p.marblePositions])) as Record<MarbleColor, number[]>;
    const invincibleMarblesByColor = Object.fromEntries(
      data.gameState.players.map(p => [p.color, p.marblePositions.filter((_, i) => p.marbleInvincible[i])])
    ) as Record<MarbleColor, number[]>;
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
      marblesByColor,
      invincibleMarblesByColor,
    };
    const allValid = getValidSevenStepsForMarble(marble1, ctx);
    return allValid.filter(steps => {
      if (steps === 7) return false; // full move — not a split
      return player.marblePositions.some(pos =>
        pos !== marble1 && getLegalSplit7Action(card, marble1, steps, pos, ctx) !== null
      );
    });
  });

  /** Data for the 7-dot connected bar UI. */
  allSevenDots = computed(() => {
    const splitSteps = this.validSplitSevenSteps();
    const allSteps = this.validSevenSteps();
    const currentSplit = this.gameStateService.sevenFirstSteps();

    return [1, 2, 3, 4, 5, 6, 7].map(dot => {
      const enabled = (dot < 7 && splitSteps.includes(dot))
        || (dot === 7 && allSteps.includes(7));

      let group: 'marble1' | 'marble2' | 'full';
      if (currentSplit === 7) {
        group = 'full';
      } else if (dot <= currentSplit) {
        group = 'marble1';
      } else {
        group = 'marble2';
      }

      return { step: dot, enabled, group, isActive: currentSplit === dot };
    });
  });

  @Output() rulesRequested = new EventEmitter<void>();

  readonly isNative = Capacitor.isNativePlatform();

  /** Vrai quand le dialogue de confirmation d'abandon est affiché. */
  showResignConfirm = signal(false);

  /** Vrai quand le sous-menu d'actions est ouvert. */
  showMenu = signal(false);

  /** Bannière "temps écoulé" : couleur du joueur concerné, null = masqué */
  timeoutBannerColor = signal<MarbleColor | null>(null);
  /** Bannière "joueur déconnecté" : couleur du joueur auto-joué, null = masqué */
  autoPlayBannerColor = signal<MarbleColor | null>(null);
  private timeoutBannerTimeout?: ReturnType<typeof setTimeout>;
  private autoPlayBannerTimeout?: ReturnType<typeof setTimeout>;
  private newTurnSub?: Subscription;
  private timeoutSub?: Subscription;
  private autoPlaySub?: Subscription;

  // ── Dérivés ────────────────────────────────────────────────────

  /** Vrai si le serveur indique qu'aucun coup légal n'est disponible. */
  isDiscardMode = computed(() =>
    this.gameStateService.data()?.gameState.canDiscard ?? false
  );

  /** Label dynamique du bouton principal. */
  confirmOrDiscardLabel = computed(() =>
    this.isDiscardMode() ? 'Discard' : 'Confirm'
  );

  /** Le bouton est actif : soit un coup est sélectionné, soit on peut défausser. */
  confirmOrDiscardEnabled = computed(() => {
    if (!this.gameStateService.isMyTurn()) return false;
    return this.isDiscardMode() || this.gameStateService.canPlay();
  });

  /** Couleur de l'arc : vert → orange → rouge */
  timerColor = computed(() => {
    const r = this.timeRatio();
    if (r > 0.5) return '#34d399'; // vert émeraude
    if (r > 0.25) return '#fbbf24'; // ambre
    return '#f87171'; // rouge
  });

  timerDashOffset = computed(() => {
    const ratio = this.timeRatio();
    return this.timerCircumference * (1 - ratio);
  });

  timeRatio = computed(() => {
    const timer = this.gameStateService.data()?.gameState?.timer ?? 0;
    return timer > 0 ? this.timeLeft() / timer : 0;
  });

  constructor(protected gameStateService: GameStateService, protected soundService: SoundService, private router: Router, protected authService: AuthService) {
    // Clear the flying card once the server updates the hand
    effect(() => {
      this.gameStateService.data()?.gameState.hand;
      this.flyingCardIndex.set(null);
    });
  }

  ngOnInit(): void {
    this.newTurnSub = this.gameStateService.newTurn.subscribe(() => {
      this.startTimer();
      this.updateTurnPhase();
      this.closeCardHelp();
    });

    this.timeoutSub = this.gameStateService.turnTimedOut$.subscribe((color) => {
      this.showTimeoutBanner(color);
    });

    this.autoPlaySub = this.gameStateService.autoPlayed$.subscribe((color) => {
      this.showAutoPlayBanner(color);
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.newTurnSub?.unsubscribe();
    this.timeoutSub?.unsubscribe();
    this.autoPlaySub?.unsubscribe();
    clearTimeout(this.helpAutoCloseTimer);
    if (this.timeoutBannerTimeout) clearTimeout(this.timeoutBannerTimeout);
    if (this.autoPlayBannerTimeout) clearTimeout(this.autoPlayBannerTimeout);
  }

  private updateTurnPhase() {
    let turnPhaseText = TURN_PHASE.MARBLE;
    if (!this.gameStateService.isMyTurn())
      turnPhaseText = TURN_PHASE.WAIT;
    else if (this.isDiscardMode())
      turnPhaseText = TURN_PHASE.DISCARD;
    else if (this.selectedCardIndex() == null)
      turnPhaseText = TURN_PHASE.CARD;
    else if (this.gameStateService.canPlay())
      turnPhaseText = TURN_PHASE.CONFIRM;
    else if (
      this.gameStateService.selectedCard()?.value === 'J' &&
      this.gameStateService.selectedMarblePosition() !== null
    )
      turnPhaseText = TURN_PHASE.SWAP_TARGET;
    else if (
      this.gameStateService.selectedCard()?.value === '7' &&
      this.gameStateService.selectedMarblePosition() !== null &&
      this.gameStateService.sevenFirstSteps() < 7
    )
      turnPhaseText = TURN_PHASE.SEVEN_SPLIT;
    this.turnPhase.set(turnPhaseText);
  }

  // ── Timer ──────────────────────────────────────────────────────
  private startTimer(): void {
    console.log("⏱️ Démarrage du timer pour ce tour");
    this.clearTimer();
    this.timeLeft.set(this.gameStateService.data()?.gameState?.timer ?? 0);
    this.timerInterval = setInterval(() => {
      const current = this.timeLeft();
      if (current <= 1) {
        this.timeLeft.set(0);
        this.clearTimer();
        this.onTimeUp();
      } else {
        const newTime = current - 1;
        this.timeLeft.set(newTime);
        if (newTime <= 5 && this.gameStateService.isMyTurn()) {
          this.soundService.playCountdownTick(newTime);
          if (Capacitor.isNativePlatform() && this.soundService.vibrationEnabled()) {
            Haptics.impact({ style: ImpactStyle.Light });
          }
        }
      }
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timerInterval != null) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
  }

  private onTimeUp(): void {
    if (this.gameStateService.isMyTurn()) {
      this.soundService.playTimeUp();
      this.gameStateService.sendTurnTimeout();
    }
    this.selectedCardIndex.set(null);
    this.turnPhase.set(TURN_PHASE.WAIT);
  }

  private showTimeoutBanner(color: MarbleColor): void {
    if (this.timeoutBannerTimeout) clearTimeout(this.timeoutBannerTimeout);
    this.timeoutBannerColor.set(color);
    this.timeoutBannerTimeout = setTimeout(() => {
      this.timeoutBannerColor.set(null);
    }, 4000);
  }

  private showAutoPlayBanner(color: MarbleColor): void {
    if (this.autoPlayBannerTimeout) clearTimeout(this.autoPlayBannerTimeout);
    this.autoPlayBannerColor.set(color);
    this.autoPlayBannerTimeout = setTimeout(() => {
      this.autoPlayBannerColor.set(null);
    }, 4000);
  }

  // ── 7 split — drag & tap sur la barre de pas ───────────────────
  onDotsRowPointerDown(event: PointerEvent): void {
    if (!this.gameStateService.isMyTurn()) return;
    event.preventDefault();
    const row = event.currentTarget as HTMLElement;
    this.splitPointerId = event.pointerId;
    row.setPointerCapture(event.pointerId);
    this.isDraggingSplit.set(true);
    this.selectNearestDot(row, event.clientX);
  }

  onDotsRowPointerMove(event: PointerEvent): void {
    if (!this.isDraggingSplit() || event.pointerId !== this.splitPointerId) return;
    event.preventDefault();
    this.selectNearestDot(event.currentTarget as HTMLElement, event.clientX);
  }

  onDotsRowPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.splitPointerId) return;
    const row = event.currentTarget as HTMLElement;
    if (row.hasPointerCapture(event.pointerId)) {
      row.releasePointerCapture(event.pointerId);
    }
    this.splitPointerId = null;
    this.isDraggingSplit.set(false);
  }

  /** Sélectionne le pas activable dont le centre est le plus proche du pointeur. */
  private selectNearestDot(row: HTMLElement, clientX: number): void {
    if (!row) return;
    let bestStep: number | null = null;
    let bestDist = Infinity;
    row.querySelectorAll<HTMLButtonElement>('.split-dot').forEach(dotEl => {
      if (dotEl.disabled) return;
      const rect = dotEl.getBoundingClientRect();
      const dist = Math.abs(clientX - (rect.left + rect.width / 2));
      if (dist < bestDist) {
        bestDist = dist;
        bestStep = Number(dotEl.dataset['step']);
      }
    });
    if (bestStep !== null && bestStep !== this.gameStateService.sevenFirstSteps()) {
      this.applySevenSteps(bestStep);
    }
  }

  private applySevenSteps(steps: number): void {
    this.gameStateService.sevenFirstSteps.set(steps);
    this.gameStateService.selectedSplit7MarblePosition.set(null);
    this.updateTurnPhase();
  }

  /** Raccourci : attribuer les 7 pas au premier pion (annule le split). */
  useAllSevenOnFirstMarble(): void {
    this.gameStateService.sevenFirstSteps.set(7);
    this.gameStateService.selectedSplit7MarblePosition.set(null);
    this.updateTurnPhase();
  }

  /** Ferme l'overlay du 7 en désélectionnant la carte et en remettant à zéro le split. */
  closeSevenSplitOverlay(): void {
    this.selectedCardIndex.set(null);
    this.gameStateService.selectedCard.set(null);
    this.gameStateService.selectedMarblePosition.set(null);
    this.gameStateService.sevenFirstSteps.set(7);
    this.gameStateService.selectedSplit7MarblePosition.set(null);
    this.turnPhase.set(TURN_PHASE.CARD);
  }

  // ── Interactions ───────────────────────────────────────────────
  onCardSelected(index: number): void {
    // Toute sélection ferme un popover d'aide encore ouvert (cas hover desktop).
    this.closeCardHelp();

    if (!this.gameStateService.isMyTurn()) {
      this.turnPhase.set(TURN_PHASE.WAIT);
      return;
    }

    if (this.isDiscardMode()) {
      this.turnPhase.set(TURN_PHASE.DISCARD);
      return;
    }

    if (this.selectedCardIndex() === index) {
      this.selectedCardIndex.set(null);
      this.gameStateService.selectedCard.set(null);
      this.gameStateService.selectedMarblePosition.set(null);
      this.gameStateService.sevenFirstSteps.set(7);
      this.gameStateService.selectedSplit7MarblePosition.set(null);
      this.turnPhase.set(TURN_PHASE.CARD);
    } else {
      const card = this.getPlayerHand()[index] ?? null;
      this.selectedCardIndex.set(index);
      this.gameStateService.selectedCard.set(card);
      this.gameStateService.selectedMarblePosition.set(null);
      this.gameStateService.selectedSwapTargetPosition.set(null);
      this.gameStateService.sevenFirstSteps.set(7);
      this.gameStateService.selectedSplit7MarblePosition.set(null);
      this.turnPhase.set(TURN_PHASE.MARBLE);
      // Tactile : affiche l'aide après la fin de l'animation de sélection (350ms)
      // pour que getBoundingClientRect() lise la position finale de la carte.
      if (!this.canHover && this.cardHelpEnabled()) {
        const targetIndex = index;
        setTimeout(() => {
          if (this.selectedCardIndex() !== targetIndex) return;
          const cardEls = document.querySelectorAll<HTMLElement>('.playable-card');
          const cardEl = cardEls[targetIndex];
          if (cardEl) this.openCardHelp(targetIndex, cardEl, 3500);
        }, 360);
      }
    }
  }

  // ── Aide contextuelle sur les cartes (auto-show mobile / hover desktop) ──
  //
  // - Tactile : le popover s'affiche automatiquement à la sélection d'une carte
  //   et se ferme seul au bout de 3,5 s (ou dès l'action suivante).
  // - Souris (appareils hover) : survol → popover, fermé au mouseleave.
  // Texte = source unique `getCardEffect()` (partagée avec le modal des règles).
  // L'option `cardHelpEnabled` (menu) désactive les deux comportements.

  /** Popover d'aide courant, ou null.
   *  x          = position horizontale clampée du centre du popover
   *  y          = top de la carte (ancrage vertical)
   *  arrowOffset = décalage horizontal de la flèche par rapport au centre du popover,
   *                pour qu'elle pointe vers le vrai centre de la carte même quand le
   *                popover a été clampé près d'un bord. */
  cardHelp = signal<{ title: string; text: string; x: number; y: number; arrowOffset: number } | null>(null);

  /** Active/désactive l'aide contextuelle (mobile + desktop). Persisté en localStorage. */
  readonly cardHelpEnabled = signal<boolean>(
    typeof localStorage === 'undefined' || localStorage.getItem('card_help_enabled') !== '0'
  );

  toggleCardHelp(): void {
    const next = !this.cardHelpEnabled();
    this.cardHelpEnabled.set(next);
    try { localStorage.setItem('card_help_enabled', next ? '1' : '0'); } catch { /* ignore */ }
    if (!next) this.closeCardHelp();
  }

  /** Appareil capable de survol réel (desktop) → active l'aide au hover. */
  private readonly canHover =
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover)').matches;

  private helpAutoCloseTimer?: ReturnType<typeof setTimeout>;

  onCardHover(index: number, event: MouseEvent): void {
    if (!this.canHover || !this.cardHelpEnabled()) return;
    this.openCardHelp(index, event.currentTarget as HTMLElement);
  }

  onCardHoverLeave(): void {
    if (!this.canHover) return;
    this.closeCardHelp();
  }

  private openCardHelp(index: number, el: HTMLElement, autoCloseMs?: number): void {
    // Aide désactivée pendant l'indication de départ du tutoriel
    // (« Play a King, Ace or Joker to start »).
    if (this.gameStateService.tutorialHintId() === 'card') return;

    const card = this.getPlayerHand()[index];
    if (!card) return;

    const effect = getCardEffect(card.value);
    const rect = el.getBoundingClientRect();
    // Ancrage horizontal clampé pour ne pas déborder de l'écran (≈ demi-largeur max).
    const HALF = 150;
    const margin = 10;
    const vw = window.innerWidth;
    const rawX = rect.left + rect.width / 2;
    const x = vw > 2 * (HALF + margin)
      ? Math.min(Math.max(rawX, HALF + margin), vw - HALF - margin)
      : vw / 2;
    // Décalage de la flèche par rapport au centre du popover, clampé pour ne
    // pas sortir des bords (marge de 7px = demi-largeur de la flèche).
    const arrowOffset = Math.min(Math.max(rawX - x, -(HALF - 7)), HALF - 7);

    this.cardHelp.set({ title: effect.title, text: effect.text, x, y: rect.top, arrowOffset });

    if (autoCloseMs !== undefined) {
      clearTimeout(this.helpAutoCloseTimer);
      this.helpAutoCloseTimer = setTimeout(() => this.closeCardHelp(), autoCloseMs);
    }
  }

  closeCardHelp(): void {
    clearTimeout(this.helpAutoCloseTimer);
    this.helpAutoCloseTimer = undefined;
    if (this.cardHelp() !== null) this.cardHelp.set(null);
  }

  /** Action du bouton principal : défausse ou confirmation selon le contexte. */
  onConfirmOrDiscard(): void {
    if (!this.confirmOrDiscardEnabled()) return;

    const myColor = this.gameStateService.myPlayerColor()!;

    // Capture the selected card's position relative to the discard pile for the fly animation
    if (!this.isDiscardMode()) {
      const idx = this.selectedCardIndex();
      if (idx !== null) {
        const cardEls = document.querySelectorAll<HTMLElement>('.playable-card');
        const cardEl = cardEls[idx];
        const discardEl = document.querySelector<HTMLElement>('.discard-pile');
        if (cardEl && discardEl) {
          const cRect = cardEl.getBoundingClientRect();
          const dRect = discardEl.getBoundingClientRect();
          const dx = (cRect.left + cRect.width / 2) - (dRect.left + dRect.width / 2);
          const dy = (cRect.top + cRect.height / 2) - (dRect.top + dRect.height / 2);
          const total = this.getPlayerHand().length;
          const center = (total - 1) / 2;
          const distFromCenter = idx - center;
          const maxSpread = Math.min(total * 8, 60);
          const step = total > 1 ? maxSpread / (total - 1) : 0;
          const angle = step * distFromCenter;
          this.gameStateService.playingCardStart.set({ dx, dy, angle });
        }
        this.flyingCardIndex.set(idx);
      }
    }

    if (this.isDiscardMode()) {
      // Aucun coup légal → défausse directe
      this.gameStateService.playAction({
        type: 'discard',
        from: 0,
        to: 0,
        cardPlayed: [],   // le serveur utilise player.cards
        playerColor: myColor,
      });
      this.gameStateService.clearLocalHand();
    } else {
      const card = this.gameStateService.selectedCard()!;
      const from1 = this.gameStateService.selectedMarblePosition()!;

      if (card.value === '7' && this.gameStateService.sevenFirstSteps() < 7) {
        // Split du 7 : encoder les deux destinations
        const steps1 = this.gameStateService.sevenFirstSteps();
        const to1 = getPositionAfterMove(from1, steps1) ?? 0;
        const from2 = this.gameStateService.selectedSplit7MarblePosition()!;
        const to2 = getPositionAfterMove(from2, 7 - steps1) ?? 0;
        this.gameStateService.playAction({
          type: 'move',
          from: from1,
          to: to1,
          splitFrom: from2,
          splitTo: to2,
          cardPlayed: [card],
          playerColor: myColor,
        });
      } else {
        // Coup normal : le serveur calcule type et to à partir de card + from
        // Pour le Jack, on inclut la cible du swap dans `to`
        const to = card.value === 'J'
          ? (this.gameStateService.selectedSwapTargetPosition() ?? 0)
          : 0;
        this.gameStateService.playAction({
          type: 'move',
          from: from1,
          to,
          cardPlayed: [card],
          playerColor: myColor,
        });
      }
    }

    this.clearTimer();
    this.selectedCardIndex.set(null);
    this.turnPhase.set('Wait for your turn');
  }

  // ── Abandon ──────────────────────────────────────────────────────
  onResign(): void {
    this.showResignConfirm.set(true);
  }

  confirmResign(): void {
    this.showResignConfirm.set(false);
    this.gameStateService.sendAbandonGame();
    this.router.navigate(['/home']);
  }

  cancelResign(): void {
    this.showResignConfirm.set(false);
  }

  // ── Disposition des cartes en éventail ─────────────────────────
  getCardStyle(index: number, total: number): { [key: string]: string } {
    if (total === 0) return {};

    const center = (total - 1) / 2;
    const distFromCenter = index - center;

    const maxSpread = Math.min(total * 8, 60);
    const step = total > 1 ? maxSpread / (total - 1) : 0;
    const angle = step * distFromCenter;

    const verticalOffset = (distFromCenter * distFromCenter) * 2;

    const overlapFactor = total > 5 ? 55 : 70;
    const xOffsetPercent = distFromCenter * overlapFactor;

    const baseTransform = `translateX(${xOffsetPercent}%) translateY(${verticalOffset}px) rotate(${angle}deg)`;

    return {
      '--card-base-transform': baseTransform,
      'transform': baseTransform,
      'z-index': String(index + 1),
      'left': '50%',
      'bottom': '0',
      'margin-left': `calc(var(--card-width) / -2)`,
    };
  }

  // ── Données ────────────────────────────────────────────────────
  getPlayerHand(): Card[] {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.hand || [];
  }

  getPlayerName(): string {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.players.find(
      (p: any) => p.color === gameData.gameState.currentTurn
    )?.name || 'Inconnu';
  }

  getPlayerColor(): string {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.currentTurn || '#7c3aed';
  }

  getMyColorGlow(): string {
    const colorMap: Record<string, string> = {
      red: 'rgba(220, 38, 38, 0.6)',
      blue: 'rgba(59, 130, 246, 0.6)',
      green: 'rgba(34, 197, 94, 0.6)',
      orange: 'rgba(251, 146, 60, 0.6)',
    };
    return colorMap[this.gameStateService.myPlayerColor() ?? ''] ?? 'transparent';
  }

  getDiscardedCards(): Card[] {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.discardedCards || [];
  }
}
