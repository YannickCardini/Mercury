import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';
import { BoardComponent } from './components/board/board.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrl: 'home.page.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, BoardComponent],
})
export class HomePage {
  constructor() { }
}

