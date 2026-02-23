import { Component, HostListener, OnInit, signal, effect } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { Player, PlayerColor } from '../../models';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { getSquareToDisplay as getSquare } from './square-data';

export interface SquareAnimation {
  /** Classe CSS à appliquer sur le .marble */
  marbleClass: string;
  /** Classe CSS optionnelle à appliquer sur la .case-path */
  squareClass?: string;
}

@Component({
  selector: 'app-board',
  templateUrl: 'board.component.html',
  styleUrls: ['board.component.scss'],
  imports: [IonCol, IonRow, IonGrid, CommonModule]
})
export class BoardComponent implements OnInit {
  gridSize = 15;
  squareSize: number = 0;
  squareToDisplay: number[] = [];

  /**
   * Map index de case → animation en cours.
   * Signal sur un Record pour que le template réagisse aux changements.
   */
  squareAnimations = signal<Record<number, SquareAnimation>>({});

  private animationTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

  // Durées par type d'action (ms) — doit correspondre à la durée CSS
  private readonly ANIMATION_DURATIONS: Record<string, number> = {
    enter: 800,
    move: 600,
    capture: 700,
    swap: 900,
    promote: 1000,
  };

  // Définition des cases spéciales
  homes: Record<PlayerColor, number[]> = {
    red: [3, 18, 33, 48],
    green: [13, 28, 43, 58],
    blue: [178, 193, 208, 223],
    orange: [168, 183, 198, 213]
  };

  arrivals: Record<PlayerColor, number[]> = {
    red: [38, 53, 68, 83],
    green: [115, 116, 117, 118],
    blue: [143, 158, 173, 188],
    orange: [108, 109, 110, 111]
  };

  starts: Record<PlayerColor, number> = {
    red: 9,
    green: 135,
    blue: 217,
    orange: 91
  };

  playerInfoStarts: { [key: number]: PlayerColor } = {
    61: 'red',
    71: 'green',
    151: 'orange',
    161: 'blue'
  };

  skippedIndices = [
    62, 63, 64, 65,
    72, 73, 74, 75,
    152, 153, 154, 155,
    162, 163, 164, 165
  ];

  debug = true;

  constructor(private gameStateService: GameStateService) {
    effect(() => {
      const lastAction = this.gameStateService.data()?.gameState?.currentTurn?.lastAction;
      if (!lastAction) return;

      const duration = this.ANIMATION_DURATIONS[lastAction.type] ?? 700;

      switch (lastAction.type) {

        // Entrée en jeu : le pion "tombe" du ciel sur sa case de départ
        case 'enter':
          this.triggerAnimation(lastAction.to, { marbleClass: 'marble-entering' }, duration);
          break;

        // Déplacement : le pion pulse sur sa nouvelle case
        case 'move':
          this.triggerAnimation(lastAction.to, { marbleClass: 'marble-moving' }, duration);
          break;

        // Capture : impact sur la case de destination, exit sur la source (pion renvoyé à la maison)
        case 'capture':
          this.triggerAnimation(lastAction.to, {
            marbleClass: 'marble-capturing',
            squareClass: 'square-impact'
          }, duration);
          this.triggerAnimation(lastAction.from, {
            marbleClass: 'marble-captured-exit'
          }, duration);
          break;

        // Échange : les deux cases scintillent de façon miroir
        case 'swap':
          this.triggerAnimation(lastAction.from, { marbleClass: 'marble-swapping' }, duration);
          this.triggerAnimation(lastAction.to, { marbleClass: 'marble-swapping' }, duration);
          break;

        // Promotion : rayonnement doré, le pion grossit puis se stabilise
        case 'promote':
          this.triggerAnimation(lastAction.to, {
            marbleClass: 'marble-promoting',
            squareClass: 'square-promoting'
          }, duration);
          break;
      }
    });
  }

  /**
   * Déclenche une animation sur une case. Pour forcer le re-trigger CSS si
   * la même classe est déjà présente, on passe d'abord par un état vide (RAF).
   */
  private triggerAnimation(index: number, anim: SquareAnimation, duration: number): void {
    const existing = this.animationTimeouts.get(index);
    if (existing) clearTimeout(existing);

    // Retire d'abord la classe pour forcer le redémarrage de l'animation CSS
    this.squareAnimations.update(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });

    requestAnimationFrame(() => {
      this.squareAnimations.update(prev => ({ ...prev, [index]: anim }));

      const timeout = setTimeout(() => {
        this.squareAnimations.update(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        this.animationTimeouts.delete(index);
      }, duration);

      this.animationTimeouts.set(index, timeout);
    });
  }

  /** Classes CSS d'animation pour le .marble d'une case */
  getMarbleAnimClass(index: number): string {
    return this.squareAnimations()[index]?.marbleClass ?? '';
  }

  /** Classes CSS d'animation pour la .case-path d'une case */
  getSquareAnimClass(index: number): string {
    return this.squareAnimations()[index]?.squareClass ?? '';
  }

  ngOnInit() {
    this.calculateSquareSize();
    this.loadSquareData();
  }

  loadSquareData() {
    this.squareToDisplay = getSquare(this.gridSize);
  }

  @HostListener('window:resize')
  onResize() {
    this.calculateSquareSize();
  }

  calculateSquareSize() {
    const wrapper = document.querySelector('.board-wrapper');
    if (!wrapper) return;

    const bounds = wrapper.getBoundingClientRect();
    const maxWidth = bounds.width;
    const maxHeight = bounds.height;

    const containerSize = Math.min(maxWidth, maxHeight) * 0.95;
    this.squareSize = containerSize / this.gridSize;
    this.gameStateService.boardContainerSize.set(this.calculateTableWrapperSize(containerSize));
  }

  private calculateTableWrapperSize(containerSize: number): number {
    const borderSize = 2;
    const padding = 0.2;
    return (containerSize + borderSize) + (((containerSize + borderSize) / this.gridSize) * padding) * 2;
  }

  get rows(): number[] { return Array(this.gridSize).fill(0).map((_, i) => i); }
  get cols(): number[] { return Array(this.gridSize).fill(0).map((_, i) => i); }

  getSquareIndex(row: number, col: number): number {
    return row * this.gridSize + col + 1;
  }

  shouldSkip(index: number): boolean {
    return this.skippedIndices.includes(index);
  }

  getSquareClass(index: number): string {
    if (!this.squareToDisplay.includes(index)) return 'case-hidden';

    for (const [color, pos] of Object.entries(this.starts)) {
      if (pos === index) return `case-path start start-${color}`;
    }
    for (const [color, positions] of Object.entries(this.homes)) {
      if (positions.includes(index)) return `case-path home home-${color}`;
    }
    for (const [color, positions] of Object.entries(this.arrivals)) {
      if (positions.includes(index)) return `case-path arrival arrival-${color}`;
    }
    return 'case-path normal';
  }

  getPlayer(color: PlayerColor): Player | undefined {
    const gameData = this.gameStateService.data();
    if (!gameData) return undefined;
    return gameData.gameState.players.find(p => p.color === color);
  }

  isCurrentTurn(color: PlayerColor): boolean {
    const gameData = this.gameStateService.data();
    return gameData?.gameState.currentTurn.color === color;
  }

  getMarbleOnSquare(index: number): PlayerColor | null {
    const gameData = this.gameStateService.data();
    if (!gameData || !this.gameStateService.isConnected()) return null;

    const player = gameData.gameState.players.find(p => (p.marblePositions || []).includes(index));
    return player ? (player.color as PlayerColor) : null;
  }
}
