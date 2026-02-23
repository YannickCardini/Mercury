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

interface Card {
  id: string;
  suit: string;
  value: string;
}

@Component({
  selector: 'app-table',
  templateUrl: 'table.component.html',
  styleUrl: 'table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule]
})
export class TableComponent implements OnInit, OnDestroy {

  /** Circonférence du cercle SVG (rayon = 27.5) */
  readonly timerCircumference = 2 * Math.PI * 27.5; // ≈ 172.79
  timeLeft = signal(0);
  timerInterval?: any; // Type 'any' pour setInterval, car il retourne un NodeJS.Timeout dans Node et un number dans le navigateur. --- IGNORE ---
  // ── Signaux UI ─────────────────────────────────────────────────
  selectedCardIndex = signal<number | null>(null);
  turnPhase = signal<string>('Choisissez une carte');

  // ── Dérivés ────────────────────────────────────────────────────
  canConfirm = computed(() => this.selectedCardIndex() !== null);


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
  })


  constructor(private gameStateService: GameStateService) { }

  ngOnInit(): void {
    this.gameStateService.newTurn.subscribe(() => {
      this.startTimer();
    })
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

  private resetTimer(): void {
    this.timeLeft.set(this.gameStateService.data()?.gameState?.timer ?? 0);
    this.startTimer();
  }

  private onTimeUp(): void {
    // Le temps est écoulé : on pourrait forcer un skip ou émettre un événement
    console.warn('Temps écoulé !');
    this.selectedCardIndex.set(null);
    this.turnPhase.set('Choisissez une carte');
  }

  // ── Interactions ───────────────────────────────────────────────
  onCardSelected(index: number): void {
    if (this.selectedCardIndex() === index) {
      this.selectedCardIndex.set(null);
      this.turnPhase.set('Choisissez une carte');
    } else {
      this.selectedCardIndex.set(index);
      this.turnPhase.set('Choisissez une bille');
    }
  }

  confirmMove(): void {
    if (!this.canConfirm()) return;

    console.log("Action confirmée avec la carte d'index :", this.selectedCardIndex());
    // this.gameStateService.playCard(this.selectedCardIndex());

    this.selectedCardIndex.set(null);
    this.turnPhase.set('Choisissez une carte');
    this.resetTimer();
  }

  // ── Disposition des cartes en éventail ─────────────────────────
  /**
   * Retourne le style CSS positionnel pour chaque carte,
   * calculant rotation et translation pour former un éventail naturel.
   */
  getCardStyle(index: number, total: number): { [key: string]: string } {
    if (total === 0) return {};

    // Calcul de la position par rapport au centre de la main
    const center = (total - 1) / 2;
    const distFromCenter = index - center;

    // Angle total de l'éventail en degrés
    const maxSpread = Math.min(total * 8, 60);
    const step = total > 1 ? maxSpread / (total - 1) : 0;
    const angle = step * distFromCenter;

    // Décalage vertical basé sur la distance au centre (forme d'arc)
    const verticalOffset = (distFromCenter * distFromCenter) * 2;

    // Espacement horizontal : on utilise des POURCENTAGES au lieu des VW !
    // Cela se basera sur la largeur réelle de la carte (--card-width)
    const overlapFactor = total > 5 ? 55 : 70; // 55% ou 70% de la largeur de la carte
    const xOffsetPercent = distFromCenter * overlapFactor;

    // Application de la transformation
    const baseTransform = `translateX(${xOffsetPercent}%) translateY(${verticalOffset}px) rotate(${angle}deg)`;

    return {
      '--card-base-transform': baseTransform,
      'transform': baseTransform,
      'z-index': String(index + 1),
      'left': '50%',
      'bottom': '0',
      // On utilise la variable CSS pour que ça s'adapte à tes Media Queries
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
      (p: any) => p.color === gameData.gameState.currentTurn.color
    )?.name || 'Inconnu';
  }

  getPlayerColor(): string {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.currentTurn.color || '#7c3aed';
  }

  getDiscardedCards(): Card[] {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.discardedCards || [];
  }
}
