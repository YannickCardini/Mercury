import { Injectable, signal } from '@angular/core';
import { GameData } from 'src/app/models/game-state.model';

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  message = signal('En attente...');
  data = signal<GameData | null>(null);
  isConnected = signal(false);

  private ws: WebSocket | null = null;

  connect(url: string) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected.set(true);
      console.log('Connecté au WebSocket');
    };

    this.ws.onmessage = (event) => {
      // Met à jour le signal automatiquement
      this.data.set(JSON.parse(event.data));
      this.message.set(`Message reçu: ${event.data}`);
    };

    this.ws.onerror = () => {
      this.isConnected.set(false);
      this.message.set('Erreur de connexion');
    };

    this.ws.onclose = () => {
      this.isConnected.set(false);
      this.message.set('Déconnecté');
    };
  }

  send(message: string) {
    if (this.ws) {
      this.ws.send(message);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
