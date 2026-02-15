import { Component, OnInit } from '@angular/core';
import { GameStateService } from '../services/game-state.service';

@Component({
    selector: 'app-test',
    template: `
    <div>
      <p>Status: {{ playerAction.isConnected() ? '🟢 Connecté' : '🔴 Déconnecté' }}</p>
      <p>{{ playerAction.message() }}</p>
      <pre>{{ playerAction.data() }}</pre>
      
      <button (click)="connect()">Connecter</button>
      <button (click)="sendTest()">Envoyer test</button>
      <button (click)="disconnect()">Déconnecter</button>
    </div>
  `
})
export class TestComponent implements OnInit {
    constructor(public playerAction: GameStateService) { }

    ngOnInit() {
        this.connect();
    }

    connect() {
        this.playerAction.connect('ws://localhost:8080');
    }

    sendTest() {
        this.playerAction.send('Hello from Angular!');
    }

    disconnect() {
        this.playerAction.disconnect();
    }
}