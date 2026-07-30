import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MarbleColor, Player } from '@mercury/shared';
import { PlayerBadgeRingComponent } from './player-badge-ring.component';

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
  imports: [CommonModule, PlayerBadgeRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerBadgeComponent {
  /** Joueur représenté ; `undefined` tant qu'aucun joueur n'occupe ce siège. */
  player = input<Player | undefined>(undefined);
  /** Couleur du siège (détermine la teinte de l'anneau au repos). */
  color = input.required<MarbleColor>();
  /** Vrai quand c'est le tour de ce joueur (anneau actif + décompte visible). */
  isCurrentTurn = input<boolean>(false);
  /** Durée totale d'un tour (secondes), pour calculer le ratio de l'anneau. */
  timer = input<number>(0);
  /** Rang du joueur au classement, ou `null` si indisponible (bot / invité). */
  rank = input<number | null>(null);
  /** Forme du badge : cercle (défaut) ou losange (paire d'équipe). */
  shape = input<'circle' | 'diamond'>('circle');

  isConnected = computed(() => this.player()?.isConnected ?? true);

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
