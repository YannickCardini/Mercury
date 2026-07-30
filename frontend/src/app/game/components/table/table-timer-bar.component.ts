import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';

/**
 * Barre de timer mobile (haut du panel), isolée de TableComponent : lit
 * `timeLeft` elle-même pour que son tick à 1 Hz ne revalide que ce petit
 * composant, et non le template entier de la table (~320 lignes, cf. Phase 1
 * de l'audit perf).
 */
@Component({
  selector: 'app-table-timer-bar',
  templateUrl: 'table-timer-bar.component.html',
  styleUrls: ['table-timer-bar.component.scss'],
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'table-timer',
    '[class.table-timer--urgent]': 'timeLeft() <= 5',
  },
})
export class TableTimerBarComponent {
  private gameState = inject(GameStateService);

  timeLeft = computed(() => this.gameState.timeLeft());

  /** Fraction de temps restante, pour la largeur de la barre (scaleX). */
  timeRatio = computed(() => {
    const timer = this.gameState.data()?.gameState?.timer ?? 0;
    return timer > 0 ? this.timeLeft() / timer : 0;
  });

  /** Couleur de l'arc/texte : vert → orange → rouge. */
  timerColor = computed(() => {
    const r = this.timeRatio();
    if (r > 0.5) return '#34d399'; // vert émeraude
    if (r > 0.25) return '#fbbf24'; // ambre
    return '#f87171'; // rouge
  });
}
