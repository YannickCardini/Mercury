import { Component, input, output } from '@angular/core';
import { MarbleColor } from '@mercury/shared';

interface ConfettiPiece {
  id: number;
  styles: { [key: string]: string };
}

@Component({
  selector: 'app-victory-overlay',
  templateUrl: './victory-overlay.component.html',
  styleUrl: './victory-overlay.component.scss',
  imports: [],
})
export class VictoryOverlayComponent {
  color = input.required<MarbleColor>();
  name = input.required<string>();
  isWinner = input.required<boolean>();
  byDefault = input<boolean>(false);
  isGuest = input<boolean>(false);
  pointsDelta = input<number | null>(null);
  newPoints = input<number | null>(null);
  newRanking = input<number | null>(null);

  backToMenu = output<void>();

  readonly particles: ConfettiPiece[] = Array.from({ length: 40 }, (_, i) => {
    const colors = ['#ef4444', '#22c55e', '#3b82f6', '#f97316', '#f0c040', '#a855f7', '#ffffff', '#fb7185'];
    const isCircle = i % 3 === 0;
    return {
      id: i,
      styles: {
        left: `${(i / 40) * 100 + (((i * 7) % 5) - 2)}%`,
        'animation-delay': `${((i * 0.13) % 3).toFixed(2)}s`,
        'animation-duration': `${(2.2 + (i * 0.11) % 2).toFixed(2)}s`,
        background: colors[i % colors.length]!,
        width: `${6 + (i % 8)}px`,
        height: `${6 + (i % 8)}px`,
        'border-radius': isCircle ? '50%' : '2px',
        transform: `rotate(${(i * 47) % 360}deg)`,
      },
    };
  });
}
