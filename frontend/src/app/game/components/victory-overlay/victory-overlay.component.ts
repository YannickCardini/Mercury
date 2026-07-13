import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { MarbleColor } from "@mercury/shared";

/** Un joueur affiché sur l'écran de fin de partie (gagnant ou perdant). */
export interface VictoryPlayer {
  color: MarbleColor;
  name: string;
  /** Photo de profil ; absente → bille planète de la couleur du joueur. */
  picture?: string;
  /** Vrai pour le joueur local (badge « You »). */
  isMe?: boolean;
  /** Nombre de pions rentrés dans la zone d'arrivée (0..4) — remplit les slots. */
  arrivalCount: number;
}

interface ConfettiPiece {
  id: number;
  styles: { [key: string]: string };
}

@Component({
  selector: "app-victory-overlay",
  templateUrl: "./victory-overlay.component.html",
  styleUrl: "./victory-overlay.component.scss",
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [NgTemplateOutlet],
})
export class VictoryOverlayComponent {
  /** Gagnant(s) : un seul en 1v3, les deux coéquipiers en 2v2. */
  winners = input.required<ReadonlyArray<VictoryPlayer>>();
  /** Perdant(s) : trois en 1v3, les deux coéquipiers adverses en 2v2. */
  losers = input<ReadonlyArray<VictoryPlayer>>([]);
  isWinner = input.required<boolean>();
  byDefault = input<boolean>(false);
  isGuest = input<boolean>(false);
  pointsDelta = input<number | null>(null);
  newPoints = input<number | null>(null);
  newRanking = input<number | null>(null);

  backToMenu = output<void>();

  /** Les 4 slots d'arrivée de chaque joueur (index < arrivalCount → rempli). */
  readonly slotIndices = [0, 1, 2, 3] as const;

  /**
   * Nom court affiché : prénom seul, tronqué par CSS si trop long — même
   * logique que `PlayerBadgeComponent.displayName` pour garantir qu'un nom
   * de joueur ne déborde jamais de la card.
   */
  displayName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '';
    return trimmed.split(/\s+/)[0];
  }

  readonly particles: ConfettiPiece[] = Array.from({ length: 40 }, (_, i) => {
    const colors = [
      "#dc2626",
      "#22c55e",
      "#3b82f6",
      "#fb923c",
      "#f0c040",
      "#a855f7",
      "#ffffff",
      "#fb7185",
    ];
    const isCircle = i % 3 === 0;
    return {
      id: i,
      styles: {
        left: `${(i / 40) * 100 + (((i * 7) % 5) - 2)}%`,
        "animation-delay": `${((i * 0.13) % 3).toFixed(2)}s`,
        "animation-duration": `${(2.2 + ((i * 0.11) % 2)).toFixed(2)}s`,
        background: colors[i % colors.length]!,
        width: `${6 + (i % 8)}px`,
        height: `${6 + (i % 8)}px`,
        "border-radius": isCircle ? "50%" : "2px",
        transform: `rotate(${(i * 47) % 360}deg)`,
      },
    };
  });
}
