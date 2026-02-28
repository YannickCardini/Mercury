import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  Action,
  GameStateMessage,
  ActionPlayedMessage,
  AnimationDoneMessage,
  ServerMessage,
} from '@keezen/shared';

@Injectable({
  providedIn: 'root',
})
export class GameStateService {

  boardContainerSize = signal(0);

  data = signal<GameStateMessage | null>(null);
  isConnected = signal(false);

  // Computed signals qui se mettent à jour automatiquement
  newTurn = new BehaviorSubject<Date | null>(null);
  actionPlayed$ = new Subject<Action>();

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
      const parsed = JSON.parse(event.data) as ServerMessage;

      switch (parsed.type) {

        case 'actionPlayed': {
          const msg = parsed as ActionPlayedMessage;
          this.actionPlayed$.next(msg.action);
          break;
        }

        case 'gameState':
        case 'welcome':
        case 'response': {
          const msg = parsed as GameStateMessage;
          this.data.set(msg);

          if (msg.message === 'New turn') {
            this.newTurn.next(new Date());
          }
          break;
        }
      }
    };

    this.ws.onerror = () => {
      this.isConnected.set(false);
    };

    this.ws.onclose = () => {
      this.isConnected.set(false);
    };
  }

  send(message: string): void {
    this.ws?.send(message);
  }

  sendAnimationDone(): void {
    const msg: AnimationDoneMessage = { type: 'animationDone' };
    this.send(JSON.stringify(msg));
  }

  disconnect(): void {
    this.ws?.close();
  }
}