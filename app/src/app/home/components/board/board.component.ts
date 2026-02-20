import { Component, HostListener, OnInit } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { Player, PlayerColor } from '../../models'; // Ajuste le chemin si besoin
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { getSquareToDisplay as getSquare } from './square-data';

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

  // Définition des cases spéciales
  homes: Record<PlayerColor, number[]> = {
    red: [3, 18, 33, 48],
    green: [13, 28, 43, 58],
    blue: [168, 183, 198, 213],
    orange: [178, 193, 208, 223]
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
    151: 'blue',
    161: 'orange'
  };

  skippedIndices = [
    62, 63, 64, 65,
    72, 73, 74, 75,
    152, 153, 154, 155,
    162, 163, 164, 165
  ];

  debug = false; // Affiche les numéros de cases pour le debug

  constructor(private gameStateService: GameStateService) { }

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

    // On récupère les dimensions exactes du parent allouées par le CSS
    const bounds = wrapper.getBoundingClientRect();
    const maxWidth = bounds.width;
    const maxHeight = bounds.height;

    // On prend la plus petite dimension pour garantir un plateau carré
    // On retire une marge de sécurité de 5% pour le padding interne et les bordures
    const containerSize = Math.min(maxWidth, maxHeight) * 0.95;

    this.squareSize = containerSize / this.gridSize;
    this.gameStateService.boardContainerSize.set(this.calculateTableWrapperSize(containerSize));
    console.log(`Calculated square size: ${this.squareSize}px (Container: ${containerSize}px)`);
  }

  private calculateTableWrapperSize(containerSize: number): number {
    const borderSize = 2; // border de 1 px de chaque côté
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
    return gameData?.gameState.currentTurn === color;
  }

  getMarbleOnSquare(index: number): PlayerColor | null {
    const gameData = this.gameStateService.data();
    if (!gameData || !this.gameStateService.isConnected()) return null;

    const player = gameData.gameState.players.find(p => (p.marblePositions || []).includes(index));
    return player ? (player.color as PlayerColor) : null;
  }
}