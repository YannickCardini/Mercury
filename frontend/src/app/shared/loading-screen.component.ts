import { ChangeDetectionStrategy, Component, Input, HostBinding } from '@angular/core';
import { MarbleOrbitComponent } from './marble-orbit.component';

/**
 * Full-screen branded loading animation (orbiting marbles + KEENZEN title).
 * Used for the initial game-page load and for the global "app resumed"
 * re-validation overlay.
 */
@Component({
  selector: 'app-loading-screen',
  standalone: true,
  imports: [MarbleOrbitComponent],
  templateUrl: './loading-screen.component.html',
  styleUrls: ['./loading-screen.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingScreenComponent {
  /** Status line shown under the animation. */
  @Input() status = 'Loading…';
  /** When false, the screen fades out (stays in DOM for the transition duration). */
  @Input() visible = true;
  @HostBinding('class.hidden') get isHidden() { return !this.visible; }
}
