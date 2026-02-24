import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject } from 'rxjs/internal/BehaviorSubject';
import { GameState, Card } from '@keezen/shared';

// Shape complète du message reçu par le WebSocket
export interface GameData {
  gameState: GameState;
  message: string;
  timestamp: string;
  type: string;
}

@Injectable({
  providedIn: 'root',
})
export class GameStateService {

  boardContainerSize = signal(0);

  message = signal('En attente...');
  data = signal<GameData | null>(null);
  isConnected = signal(false);

  // Computed signals qui se mettent à jour automatiquement
  hand = computed<Card[]>(() => this.data()?.gameState?.hand ?? []);
  newTurn = new BehaviorSubject<Date | null>(null);

  private ws: WebSocket | null = null;

  /**
   * @param url      URL du WebSocket
   * @param onOpen   Callback appelé dès que la connexion est ouverte
   */
  connect(url: string, onOpen?: () => void): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected.set(true);
      console.log('Connecté au WebSocket');
      onOpen?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const parsed: GameData = JSON.parse(event.data);
      this.data.set(parsed);
      this.message.set(`Message reçu: ${event.data}`);
      console.log('Données mises à jour:', parsed);

      if (parsed.message === 'New turn') {
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

  send(message: string): void {
    this.ws?.send(message);
  }

  disconnect(): void {
    this.ws?.close();
  }
}