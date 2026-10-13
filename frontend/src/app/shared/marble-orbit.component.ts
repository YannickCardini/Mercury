import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';

@Component({
  selector: 'app-marble-orbit',
  standalone: true,
  templateUrl: './marble-orbit.component.html',
  styleUrls: ['./marble-orbit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarbleOrbitComponent {
  /** 'lg' = écran de chargement ; 'sm' = page home. Dimensions dans le SCSS (--_r). */
  @Input() size: 'sm' | 'lg' = 'lg';
  @HostBinding('class.sm') get isSm() { return this.size === 'sm'; }
  /** Purement décoratif : ignoré des lecteurs d'écran. */
  @HostBinding('attr.aria-hidden') readonly ariaHidden = 'true';
}
