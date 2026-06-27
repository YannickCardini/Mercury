import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';

@Component({
  selector: 'app-marble-orbit',
  standalone: true,
  templateUrl: './marble-orbit.component.html',
  styleUrls: ['./marble-orbit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarbleOrbitComponent {
  /** 'lg' = 180px (écran de chargement) ; 'sm' = 140px (page home) */
  @Input() size: 'sm' | 'lg' = 'lg';
  @HostBinding('class.sm') get isSm() { return this.size === 'sm'; }
}
