import { CommonModule } from '@angular/common';
import { GameStateService } from './../../services/game-state.service';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  OnInit,
  OnDestroy
} from '@angular/core';
import { TockCardComponent } from 'src/app/shared/tock-card.component';
import type { Card } from '@keezen/shared';

@Component({
  selector: 'app-table',
  templateUrl: 'table.component.html',
  styleUrl: 'table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, TockCardComponent]
})
export class TableComponent implements OnInit, OnDestroy {

  /** Circonférence du cercle SVG (rayon = 27.5) */
  readonly timerCircumference = 2 * Math.PI * 27.5; // ≈ 172.79
  timeLeft = signal(0);
  timerInterval?: any; // Type 'any' pour setInterval --- IGNORE ---
  // ── Signaux UI ─────────────────────────────────────────────────
  selectedCardIndex = signal<number | null>(null);
  turnPhase = signal<string>('Choisissez une carte');

  // ── Dérivés ────────────────────────────────────────────────────
  canConfirm = computed(() => this.gameStateService.canPlay());

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

  constructor(protected gameStateService: GameStateService) { }

  ngOnInit(): void {
    this.gameStateService.newTurn.subscribe(() => {
      this.startTimer();
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
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
        this.timeLeft.set(current - 1);
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
    console.warn('Temps écoulé !');
    this.selectedCardIndex.set(null);
    this.turnPhase.set('Choisissez une carte');
  }

  // ── Interactions ───────────────────────────────────────────────
  onCardSelected(index: number): void {
    if (!this.gameStateService.isMyTurn()) return;

    if (this.selectedCardIndex() === index) {
      this.selectedCardIndex.set(null);
      this.gameStateService.selectedCard.set(null);
      this.turnPhase.set('Choisissez une carte');
    } else {
      const card = this.getPlayerHand()[index] ?? null;
      this.selectedCardIndex.set(index);
      this.gameStateService.selectedCard.set(card);
      this.turnPhase.set('Choisissez une bille');
    }
  }

  /** Action du bouton principal : défausse ou confirmation selon le contexte. */
  onConfirmOrDiscard(): void {
    if (!this.confirmOrDiscardEnabled()) return;

    const myColor = this.gameStateService.myPlayerColor()!;

    if (this.isDiscardMode()) {
      // Aucun coup légal → défausse directe
      this.gameStateService.playAction({
        type: 'discard',
        from: 0,
        to: 0,
        cardPlayed: [],   // le serveur utilise player.cards
        playerColor: myColor,
      });
    } else {
      // Coup normal : le serveur calcule type et to à partir de card + from
      this.gameStateService.playAction({
        type: 'move',   // placeholder
        from: this.gameStateService.selectedMarblePosition()!,
        to: 0,          // placeholder
        cardPlayed: [this.gameStateService.selectedCard()!],
        playerColor: myColor,
      });
    }

    this.selectedCardIndex.set(null);
    this.turnPhase.set('Choisissez une carte');
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

  getDiscardedCards(): Card[] {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.discardedCards || [];
  }
}
