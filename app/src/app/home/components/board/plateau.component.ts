import { Component, HostListener, OnInit } from '@angular/core';
import { getSquareToDisplay } from './square-data';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-board',
  templateUrl: 'board.component.html',
  styleUrl: 'board.component.scss',
})
export class BoardComponent implements OnInit {
  gridSize = 15;
  squareSize: number = 0;
  squareToDisplay: number[] = [];

  constructor(private gameStateService: GameStateService) { }

  ngOnInit() {
    console.log(this.gameStateService.data());
    this.calculateSquareSize();
    this.loadSquareData();
  }

  loadSquareData() {
    this.squareToDisplay = getSquareToDisplay(this.gridSize);
  }

  @HostListener('window:resize')
  onResize() {
    this.calculateSquareSize();
  }

  calculateSquareSize() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight - 56;

    const sizeBasedOnWidth = viewportWidth / this.gridSize;
    const sizeBasedOnHeight = viewportHeight / this.gridSize;

    this.squareSize = Math.min(sizeBasedOnWidth, sizeBasedOnHeight);
  }

  get rows(): number[] {
    return Array(this.gridSize).fill(0).map((_, i) => i);
  }

  get cols(): number[] {
    return Array(this.gridSize).fill(0).map((_, i) => i);
  }

  getSquareIndex(row: number, col: number): number {
    return row * this.gridSize + col + 1;
  }

  shouldDisplayThisSquare(row: number, col: number) {
    const squareIndex = this.getSquareIndex(row, col);
    return this.squareToDisplay.includes(squareIndex);
  }

  getPlayerColorAtPosition(row: number, col: number): string {
    const gameData = this.gameStateService.data();
    if (!gameData || !this.gameStateService.isConnected()) return '';

    const playerPositions = [
      { position: gameData.gameState.redPlayerMarblePosition, color: '#ef4444' },
      { position: gameData.gameState.greenPlayerMarblePosition, color: '#22c55e' },
      { position: gameData.gameState.bluePlayerMarblePosition, color: '#3b82f6' },
      { position: gameData.gameState.orangePlayerMarblePosition, color: '#f97316' }
    ];

    const squareIndex = this.getSquareIndex(row, col);
    const player = playerPositions.find(p => (p.position || []).includes(squareIndex));
    return player ? player.color : '';
  }
}

