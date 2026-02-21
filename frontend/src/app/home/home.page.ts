import { Component } from '@angular/core';
import { IonContent, ViewDidEnter } from '@ionic/angular/standalone';
import { BoardComponent } from './components/board/board.component';
import { TableComponent } from './components/table/table.component';
import { GameStateService } from './services/game-state.service';
import { environment } from '../../environments/environment';
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrl: 'home.page.scss',
  imports: [IonContent, BoardComponent, TableComponent],
})
export class HomePage implements ViewDidEnter {

  constructor(public gameStateService: GameStateService) { }
  ionViewDidEnter(): void {
    this.connect();
  }

  connect() {
    this.gameStateService.connect(environment.wsUrl);
  }

  disconnect() {
    this.gameStateService.disconnect()
  }
}

