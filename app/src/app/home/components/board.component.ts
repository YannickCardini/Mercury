import { Component, HostListener, OnInit } from '@angular/core';

@Component({
  selector: 'app-board',
  templateUrl: 'board.component.html',
  styleUrl: 'board.component.scss',
})
export class BoardComponent implements OnInit {
  gridSize = 11;
  squareSize: number = 0;


  squareToDisplay = [4, 5, 6, 7, 8, 15, 19, 30, 41, 42, 43, 44, 26, 37,
    34, 35, 36, 45, 55, 56, 66, 67, 86, 87, 88, 77, 79, 78, 80, 81, 85, 92, 96, 103, 107, 114, 115, 116, 117, 118]

  constructor() { }

  ngOnInit() {
    this.calculateSquareSize();
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
}

