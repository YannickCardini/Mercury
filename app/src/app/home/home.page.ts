import { Component, signal } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';
import { BoardComponent } from './components/board/plateau.component';
import { TableComponent } from './components/table/table.component';
import { TestComponent } from './components/test.component';
import { GameStateService } from './services/game-state.service';
import { GameState } from '../models/game-state.model';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrl: 'home.page.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, BoardComponent, TableComponent, TestComponent],
})
export class HomePage {

    constructor(public gameStateService: GameStateService) { }

    ngOnInit() {
        this.connect();
    }

    connect() {
        this.gameStateService.connect('ws://localhost:8080');
    }

    disconnect() {
        this.gameStateService.disconnect()
    }
}

