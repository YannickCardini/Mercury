import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MarbleColor, Player } from '@mercury/shared';
import { PlayerBadgeRingComponent } from './player-badge-ring.component';

/**
 * Badge joueur affiché dans un coin du plateau : un pion fait d'un jeton à la
 * couleur du siège (circulaire par défaut, ou en losange avec `shape="diamond"`
 * pour distinguer une paire de partenaires sur la diagonale) emboîté dans un
 * socle.
 *
 * Il réunit :
 *   • la photo de profil, incrustée dans le liseré du jeton ;
 *   • ce liseré, qui est aussi le timer : il se vide quand c'est le tour du joueur ;
 *   • le nombre de cartes en main (éventail de deux cartes, haut-droite) ;
 *   • le nom et le rang sur le socle, qui prend la couleur du siège pendant son tour ;
 *   • l'étiquette « Teammate » sur le socle du coéquipier du joueur local ;
 *   • un indicateur de déconnexion (haut-gauche + photo désaturée).
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
  /** Vrai pour le badge du coéquipier du joueur local : affiche l'étiquette « Teammate ». */
  isPartner = input<boolean>(false);

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
