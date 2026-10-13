import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';

/**
 * Logo vivant : les quatre billes forment le trèfle de l'icône, partent faire
 * un tour de piste chacune son tour, puis reviennent. Interchangeable avec
 * `MarbleOrbitComponent` (l'orrery, gardé en réserve).
 */
@Component({
  selector: 'app-marble-clover',
  standalone: true,
  templateUrl: './marble-clover.component.html',
  styleUrls: ['./marble-clover.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarbleCloverComponent {
  /** 'lg' = écran de chargement ; 'sm' = page home. Dimensions dans le SCSS (--_d). */
  @Input() size: 'sm' | 'lg' = 'lg';
  @HostBinding('class.sm') get isSm() { return this.size === 'sm'; }
  /** Purement décoratif : ignoré des lecteurs d'écran. */
  @HostBinding('attr.aria-hidden') readonly ariaHidden = 'true';
}
