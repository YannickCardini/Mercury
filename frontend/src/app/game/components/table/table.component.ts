import { CommonModule } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  OnInit,
  OnDestroy
} from '@angular/core';
import { TockCardComponent } from 'src/app/shared/tock-card.component';
import type { Card, MarbleColor } from '@keezen/shared';
import { getValidSevenStepsForMarble, getPositionAfterMove, getLegalSplit7Action, type LegalMoveContext } from '@keezen/shared';
import { Subscription } from 'rxjs';
import { SoundService } from '../../services/sound.service';

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
  imports: [CommonModule, TockCardComponent]
}) export class TableComponent implements OnInit, OnDestroy {


  /** Circonférence du cercle SVG (rayon = 27.5) */
  readonly timerCircumference = 2 * Math.PI * 27.5; // ≈ 172.79
  timeLeft = signal(0);
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

  /** Vrai quand le compteur de pas du 7 doit être affiché. */
  showSevenStepCounter = computed(() =>
    this.gameStateService.isMyTurn() &&
    this.gameStateService.selectedCard()?.value === '7' &&
    this.gameStateService.selectedMarblePosition() !== null &&
    this.validSplitSevenSteps().length > 0
  );

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
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
      marblesByColor,
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
    const ctx: LegalMoveContext = {
      ownMarbles: player.marblePositions,
      allMarbles: data.gameState.players.flatMap(p => p.marblePositions),
      playerColor: myColor,
      marblesByColor,
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

  /** Bannière "temps écoulé" : couleur du joueur concerné, null = masqué */
  timeoutBannerColor = signal<MarbleColor | null>(null);
  private timeoutBannerTimeout?: ReturnType<typeof setTimeout>;
  private timeoutSub?: Subscription;

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

  constructor(protected gameStateService: GameStateService, private soundService: SoundService) {
    // Clear the flying card once the server updates the hand
    effect(() => {
      this.gameStateService.data()?.gameState.hand;
      this.flyingCardIndex.set(null);
    });
  }

  ngOnInit(): void {
    this.gameStateService.newTurn.subscribe(() => {
      this.startTimer();
      this.updateTurnPhase();
    });

    this.timeoutSub = this.gameStateService.turnTimedOut$.subscribe((color) => {
      this.showTimeoutBanner(color);
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.timeoutSub?.unsubscribe();
    if (this.timeoutBannerTimeout) clearTimeout(this.timeoutBannerTimeout);
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

  // ── 7 step counter ─────────────────────────────────────────────
  selectSevenSteps(steps: number): void {
    const current = this.gameStateService.sevenFirstSteps();
    // Toggle off if clicking the already-selected step
    if (current === steps) {
      this.gameStateService.sevenFirstSteps.set(7);
    } else {
      this.gameStateService.sevenFirstSteps.set(steps);
    }
    this.gameStateService.selectedSplit7MarblePosition.set(null);
    this.updateTurnPhase();
  }

  // ── Interactions ───────────────────────────────────────────────
  onCardSelected(index: number): void {
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
    }
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

    this.selectedCardIndex.set(null);
    this.turnPhase.set('Wait for your turn');
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
      red: 'rgba(239, 68, 68, 0.25)',
      blue: 'rgba(59, 130, 246, 0.25)',
      green: 'rgba(34, 197, 94, 0.25)',
      orange: 'rgba(249, 115, 22, 0.25)',
    };
    return colorMap[this.gameStateService.myPlayerColor() ?? ''] ?? 'transparent';
  }

  getDiscardedCards(): Card[] {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.discardedCards || [];
  }
}
