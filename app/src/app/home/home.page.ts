import { Component, HostListener, OnInit } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrl: 'home.page.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class HomePage implements OnInit {
  gridSize = 11;
  squareSize: number = 0;

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
    const viewportHeight = window.innerHeight - 56; // Hauteur approximative du header

    // Calculer la taille basée sur la plus petite dimension
    const sizeBasedOnWidth = viewportWidth / this.gridSize;
    const sizeBasedOnHeight = viewportHeight / this.gridSize;

    // Utiliser la plus petite valeur pour que tout rentre dans l'écran
    this.squareSize = Math.min(sizeBasedOnWidth, sizeBasedOnHeight);
  }

  // Générer un tableau pour les lignes
  get rows(): number[] {
    return Array(this.gridSize).fill(0).map((_, i) => i);
  }

  // Générer un tableau pour les colonnes
  get cols(): number[] {
    return Array(this.gridSize).fill(0).map((_, i) => i);
  }

  getSquareIndex(row: number, col: number): number {
    return row * this.gridSize + col + 1;
  }
}

