import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';

/**
 * Anneau-timer desktop, isolé de TableComponent : lit `timeLeft` lui-même
 * pour que son tick à 1 Hz ne revalide que ce petit composant, et non le
 * template entier de la table (~320 lignes, cf. Phase 1 de l'audit perf).
 */
@Component({
  selector: 'app-timer-ring',
  templateUrl: 'timer-ring.component.html',
  styleUrls: ['timer-ring.component.scss'],
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'timer-ring',
    '[class.urgent]': 'timeLeft() <= 10',
    '[class.timer-inactive]': '!isMyTurn()',
  },
})
export class TimerRingComponent {
  private gameState = inject(GameStateService);

  /** Vrai quand c'est le tour du joueur local (anneau atténué sinon). */
  isMyTurn = input<boolean>(false);

  /** Circonférence du cercle SVG (rayon = 27.5) */
  readonly timerCircumference = 2 * Math.PI * 27.5; // ≈ 172.79

  timeLeft = computed(() => this.gameState.timeLeft());

  private timeRatio = computed(() => {
    const timer = this.gameState.data()?.gameState?.timer ?? 0;
    return timer > 0 ? this.timeLeft() / timer : 0;
  });

  /** Couleur de l'arc : vert → orange → rouge */
  timerColor = computed(() => {
    const r = this.timeRatio();
    if (r > 0.5) return '#34d399'; // vert émeraude
    if (r > 0.25) return '#fbbf24'; // ambre
    return '#f87171'; // rouge
  });

  timerDashOffset = computed(() => this.timerCircumference * (1 - this.timeRatio()));
}
