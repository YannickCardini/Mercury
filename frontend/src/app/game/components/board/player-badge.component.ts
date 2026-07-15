import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MarbleColor, Player } from '@mercury/shared';

/**
 * Pastille joueur affichée dans un coin du plateau — circulaire par défaut,
 * ou en losange (`shape="diamond"`) pour distinguer visuellement une paire
 * de joueurs (partenaires d'équipe sur la diagonale).
 *
 * Regroupe, autour de la photo de profil :
 *   • un anneau-timer qui se vide à chaque seconde quand c'est le tour du joueur ;
 *   • le décompte (secondes restantes) superposé au centre, durant son tour ;
 *   • le nombre de cartes en main (pastille en bas à droite) ;
 *   • le rang du joueur (badge bas-centre) ;
 *   • un indicateur de déconnexion discret (bas-gauche + avatar désaturé).
 *
 * Composant purement présentationnel : toutes les données proviennent des inputs.
 */
@Component({
  selector: 'app-player-badge',
  templateUrl: 'player-badge.component.html',
  styleUrls: ['player-badge.component.scss'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerBadgeComponent {
  /** Joueur représenté ; `undefined` tant qu'aucun joueur n'occupe ce siège. */
  player = input<Player | undefined>(undefined);
  /** Couleur du siège (détermine la teinte de l'anneau au repos). */
  color = input.required<MarbleColor>();
  /** Vrai quand c'est le tour de ce joueur (anneau actif + décompte visible). */
  isCurrentTurn = input<boolean>(false);
  /** Secondes restantes du tour courant (partagé, pertinent si `isCurrentTurn`). */
  timeLeft = input<number>(0);
  /** Durée totale d'un tour (secondes), pour calculer le ratio de l'anneau. */
  timer = input<number>(0);
  /** Rang du joueur au classement, ou `null` si indisponible (bot / invité). */
  rank = input<number | null>(null);
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

  /** Longueur totale du tracé de l'anneau, selon la forme. */
  perimeter = computed(() => (this.shape() === 'diamond' ? this.diamondPerimeter : this.circumference));

  /** Fraction de temps restante (1 = plein). Plein quand ce n'est pas son tour. */
  ratio = computed(() => {
    if (!this.isCurrentTurn()) return 1;
    const total = this.timer();
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, this.timeLeft() / total));
  });

  /** Décalage de l'arc : 0 = plein, périmètre = vide. */
  dashOffset = computed(() => this.perimeter() * (1 - this.ratio()));

  /**
   * Couleur de l'arc pendant le tour actif (vert → ambre → rouge).
   * `null` au repos → l'anneau prend la teinte du joueur via le CSS.
   */
  arcColor = computed<string | null>(() => {
    if (!this.isCurrentTurn()) return null;
    const r = this.ratio();
    if (r > 0.5) return 'var(--pb-color)';
    if (r > 0.25) return '#fbbf24';
    return '#f87171';
  });

  isConnected = computed(() => this.player()?.isConnected ?? true);
  isUrgent = computed(() => this.isCurrentTurn() && this.timeLeft() <= 5);

  /** Nom court affiché sur la plaque : prénom seul, tronqué par CSS si trop long. */
  displayName = computed(() => {
    const name = this.player()?.name?.trim();
    if (!name) return '';
    return name.split(/\s+/)[0];
  });

  /**
   * Palier du rang pour la mise en valeur : podium (or/argent/bronze) ou
   * `normal` (style atténué hors top 3). `null` si le rang est inconnu.
   */
  rankTier = computed<'gold' | 'silver' | 'bronze' | 'normal' | null>(() => {
    const r = this.rank();
    if (r === null) return null;
    if (r === 1) return 'gold';
    if (r === 2) return 'silver';
    if (r === 3) return 'bronze';
    return 'normal';
  });
}
