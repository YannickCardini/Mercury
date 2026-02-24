import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject } from 'rxjs/internal/BehaviorSubject';
import { GameData } from 'src/app/home/models';

@Injectable({
  providedIn: 'root',
})
export class GameStateService {

  boardContainerSize = signal(0);

  message = signal('En attente...');
  data = signal<GameData | null>(null);
  isConnected = signal(false);

  // Computed signal that automatically updates when data changes
  hand = computed(() => this.data()?.gameState?.hand ?? []);
  newTurn = new BehaviorSubject<Date | null>(null);

  private ws: WebSocket | null = null;

  /**
   * @param url      URL du WebSocket
   * @param onOpen   Callback appelé dès que la connexion est ouverte
   */
  connect(url: string, onOpen?: () => void) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected.set(true);
      console.log('Connecté au WebSocket');
      onOpen?.();
    };

    this.ws.onmessage = (event) => {
      this.data.set(JSON.parse(event.data));
      this.message.set(`Message reçu: ${event.data}`);
      console.log('Données mises à jour:', this.data());
      if (this.data()?.message === 'New turn') {
        this.newTurn.next(new Date());
      }
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