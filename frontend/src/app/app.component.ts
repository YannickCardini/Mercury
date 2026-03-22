import { Component, OnInit, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, NavController } from '@ionic/angular/standalone';
import { take } from 'rxjs';
import { GameStateService } from './game/services/game-state.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {

  private gameStateService = inject(GameStateService);
  private navCtrl = inject(NavController);

  ngOnInit(): void {
    const guestPlayerId = localStorage.getItem('guest_player_id');
    const activeGameId = localStorage.getItem('active_game_id');

    if (guestPlayerId && activeGameId) {
      this.gameStateService.connect(environment.wsUrl, () => {
        this.gameStateService.sendJoinGame(guestPlayerId, activeGameId);
      });

      // Listen for gameState (reconnection success) or actionRejected (session expired)
      this.gameStateService.gameStarted$.pipe(take(1)).subscribe(() => {
        this.navCtrl.navigateRoot(['/game']);
      });

      this.gameStateService.actionRejected$.pipe(take(1)).subscribe(() => {
        localStorage.removeItem('active_game_id');
        this.gameStateService.disconnect();
      });
    }
  }
}
