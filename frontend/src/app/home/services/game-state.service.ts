import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  Card,
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

  message = signal('En attente...');
  data = signal<GameStateMessage | null>(null);
  isConnected = signal(false);

  // Computed signals qui se mettent à jour automatiquement
  hand = computed<Card[]>(() => this.data()?.gameState?.hand ?? []);

  // ── Émis à chaque nouveau gameState (nouveau tour prêt à commencer)
  // ⚠️  N'est plus émis automatiquement ici — c'est le BoardComponent qui l'émet
  //     APRÈS la fin de toutes ses animations (fly card + marble), pour garantir
  //     la séquence : carte → pion → bandeau.
  newTurn = new BehaviorSubject<Date | null>(null);

  // Émis à chaque actionPlayed reçu du backend.
  // Le board.component s'y abonne pour déclencher les animations.
  actionPlayed$ = new Subject<Action>();

  // ── Nouveau : émis par BoardComponent une fois TOUTES les animations terminées.
  // home.page s'y abonne pour afficher le bandeau "Nouveau tour".
  // On transporte aussi le message du gameState pour filtrer si besoin.
  allAnimationsDone$ = new Subject<void>();

  // Message du dernier gameState reçu — stocké pour que le board puisse
  // savoir si un bandeau doit être affiché après ses animations.
  pendingGameStateMessage: string | null = null;

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

        // ── Une action vient d'être jouée ──────────────────────────────────
        // Le backend attend notre `animationDone` avant de passer au tour suivant.
        case 'actionPlayed': {
          const msg = parsed as ActionPlayedMessage;
          console.log('▶️ Action reçue:', msg.action);
          this.actionPlayed$.next(msg.action);
          break;
        }

        // ── Nouvel état de jeu ─────────────────────────────────────────────
        // On stocke le message pour que le BoardComponent sache s'il doit
        // déclencher le bandeau après ses animations. On NE déclenche PAS
        // newTurn ici — c'est le BoardComponent qui le fera après animations.
        case 'gameState':
        case 'welcome':
        case 'response': {
          const msg = parsed as GameStateMessage;
          this.data.set(msg);
          this.message.set(`Message reçu: ${event.data}`);
          console.log('Données mises à jour:', msg);

          // Mémorise le message pour que le board puisse y accéder en phase 2
          this.pendingGameStateMessage = msg.message;
          break;
        }
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

  /**
   * Signale au backend que les animations sont terminées et qu'il peut
   * passer au tour suivant. Déclenche aussi allAnimationsDone$ pour que
   * home.page affiche le bandeau.
   */
  sendAnimationDone(): void {
    const msg: AnimationDoneMessage = { type: 'animationDone' };
    this.send(JSON.stringify(msg));
    console.log('✅ animationDone envoyé');

    // Bandeau uniquement pour les vrais nouveaux tours
    if (this.pendingGameStateMessage === 'New turn') {
      this.newTurn.next(new Date());
    }
    this.pendingGameStateMessage = null;

    // Signale à home.page que tout est terminé
    this.allAnimationsDone$.next();
  }

  disconnect(): void {
    this.ws?.close();
  }
}