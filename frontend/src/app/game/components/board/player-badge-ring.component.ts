import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';

/**
 * Jeton-timer du badge joueur (liseré coloré + tranche), isolé dans son propre
 * composant : il lit `timeLeft` lui-même plutôt que de le recevoir en input. `timeLeft` tique
 * chaque seconde pendant tout le tour d'un joueur ; en le lisant ICI (et non
 * dans le template de player-badge ou du board), seul ce petit composant
 * (~6 nœuds) est revalidé à chaque tick, au lieu du plateau entier.
 */
@Component({
  selector: 'app-player-badge-ring',
  templateUrl: 'player-badge-ring.component.html',
  styleUrls: ['player-badge-ring.component.scss'],
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.ring--current]': 'isCurrentTurn()',
    '[class.ring--urgent]': 'isUrgent()',
    '[class.ring--diamond]': "shape() === 'diamond'",
  },
})
export class PlayerBadgeRingComponent {
  private gameState = inject(GameStateService);

  /** Vrai quand c'est le tour de ce joueur (anneau actif + décompte visible). */
  isCurrentTurn = input<boolean>(false);
  /** Durée totale d'un tour (secondes), pour calculer le ratio de l'anneau. */
  timer = input<number>(0);
  /** Forme du badge : cercle (défaut) ou losange (paire d'équipe). */
  shape = input<'circle' | 'diamond'>('circle');

  /** Rayon SVG (viewBox 100×100) ; circonférence = 2πr. */
  readonly circumference = 2 * Math.PI * 46;

  /**
   * Anneau losange : carré pivoté de 45°, coins arrondis. À encombrement égal
   * un losange paraît bien plus petit qu'un cercle ; on égalise donc les AIRES :
   * 2R² = πr² → sommets à R = r·√(π/2) ≈ 57.7 du centre (le SVG déborde de sa
   * viewBox, overflow visible — les slots losange sont rentrés d'autant dans le
   * board pour échapper au contain:paint). Périmètre = 4·(côté − 2rx) + 2πrx.
   */
  readonly diamondRadius = 46 * Math.sqrt(Math.PI / 2);
  readonly diamondSide = this.diamondRadius * Math.SQRT2;
  readonly diamondCornerRadius = 12.5;
  readonly diamondPerimeter =
    4 * (this.diamondSide - 2 * this.diamondCornerRadius) + 2 * Math.PI * this.diamondCornerRadius;

  /** Épaisseur du liseré (unités viewBox) : la face colorée du jeton. */
  readonly bezelWidth = 7;
  /** Hauteur de la tranche visible sous le jeton. */
  readonly ledgeDepth = 5;
  /**
   * Fond sombre sous la photo : il s'arrête au bord intérieur du liseré, que
   * l'avatar (player-badge.component.scss) recouvre de 0,6. Toute modification
   * de `bezelWidth` se répercute sur les `inset` et `border-radius` de l'avatar.
   */
  readonly inlayWidth = 1.5;
  private readonly inlayInset = (this.bezelWidth + this.inlayWidth) / 2;
  readonly inlayRadius = 46 - this.inlayInset;
  readonly diamondInlaySide = this.diamondSide - 2 * this.inlayInset;
  readonly diamondInlayCornerRadius = this.diamondCornerRadius - this.inlayInset;
  /** Tranche = même tracé que le liseré, descendu de `ledgeDepth` (après sa rotation). */
  readonly circleLedgeTransform = `translate(0 ${this.ledgeDepth}) rotate(-90 50 50)`;
  readonly diamondLedgeTransform = `translate(0 ${this.ledgeDepth}) rotate(45 50 50)`;

  /** Longueur totale du tracé de l'anneau, selon la forme. */
  perimeter = computed(() => (this.shape() === 'diamond' ? this.diamondPerimeter : this.circumference));

  /** Fraction de temps restante (1 = plein). Plein quand ce n'est pas son tour. */
  ratio = computed(() => {
    if (!this.isCurrentTurn()) return 1;
    const total = this.timer();
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, this.gameState.timeLeft() / total));
  });

  /** Décalage de l'arc : 0 = plein, périmètre = vide. */
  dashOffset = computed(() => this.perimeter() * (1 - this.ratio()));

  /**
   * Couleur de l'arc pendant le tour actif (couleur du siège → or → rouge).
   * `null` au repos → l'anneau prend la teinte du joueur via le CSS.
   */
  arcColor = computed<string | null>(() => {
    if (!this.isCurrentTurn()) return null;
    const r = this.ratio();
    if (r > 0.5) return 'var(--pb-color)';
    if (r > 0.25) return 'var(--m-gold)';
    return 'var(--m-red-light)';
  });

  /**
   * Tranche de l'arc : la teinte « deep » de sa couleur du moment, pour que
   * l'épaisseur du jeton suive le liseré (elle se vide et change de couleur
   * avec lui). `null` au repos → teinte « deep » du siège via le CSS.
   */
  arcLedgeColor = computed<string | null>(() => {
    if (!this.isCurrentTurn()) return null;
    const r = this.ratio();
    if (r > 0.5) return 'var(--pb-deep)';
    if (r > 0.25) return 'var(--m-gold-deep)';
    return 'var(--m-red-deep)';
  });

  isUrgent = computed(() => this.isCurrentTurn() && this.gameState.timeLeft() <= 5);
}
