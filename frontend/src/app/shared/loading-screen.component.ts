import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Full-screen branded loading animation (orbiting marbles + KEENZEN title).
 * Used for the initial game-page load and for the global "app resumed"
 * re-validation overlay.
 */
@Component({
  selector: 'app-loading-screen',
  standalone: true,
  templateUrl: './loading-screen.component.html',
  styleUrls: ['./loading-screen.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingScreenComponent {
  /** Status line shown under the animation. */
  @Input() status = 'Loading…';
}
