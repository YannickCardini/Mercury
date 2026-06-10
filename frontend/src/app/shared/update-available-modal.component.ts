import { Component, Input } from '@angular/core';

/**
 * Popup de mise à jour OBLIGATOIRE.
 *
 * Suit la convention des modales maison (`@Input() show`, rendu conditionnel
 * par un parent), mais — la mise à jour étant forcée — n'expose volontairement
 * AUCUN moyen de fermer : pas de bouton de fermeture, pas de « Plus tard », pas
 * de fermeture au clic sur l'overlay. Le seul chemin possible est de mettre à
 * jour l'application.
 */
@Component({
  selector: 'app-update-available-modal',
  templateUrl: './update-available-modal.component.html',
  styleUrl: './update-available-modal.component.scss',
  standalone: true,
})
export class UpdateAvailableModalComponent {
  /** Affiche le popup quand true. */
  @Input() show = false;
  /** Lien Play Store ouvert par le bouton « Update ». */
  @Input() storeUrl = 'https://play.google.com/store/apps/details?id=online.mercury.game';

  openStore(): void {
    // `_system` fait quitter la WebView et ouvre le Play Store (app ou navigateur).
    window.open(this.storeUrl, '_system');
  }
}
