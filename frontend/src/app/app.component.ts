import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { take } from 'rxjs';
import { GameStateService } from './game/services/game-state.service';
import { TabLockService } from './game/services/tab-lock.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [RouterOutlet],
})
export class AppComponent implements OnInit {

  private gameStateService = inject(GameStateService);
  private tabLock = inject(TabLockService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    // Handle session replaced by another tab (close code 4001)
    this.gameStateService.sessionReplaced$.subscribe(() => {
      this.router.navigate(['/home']);
    });

    // Handle game abandoned (all human players left)
    this.gameStateService.gameAbandoned$.subscribe(() => {
      this.gameStateService.reset();
      this.router.navigate(['/home']);
    });

    const guestPlayerId = localStorage.getItem('guest_player_id');
    const activeGameId = localStorage.getItem('active_game_id');

    if (guestPlayerId && activeGameId) {
      // If another tab already manages this game, don't reconnect
      if (await this.tabLock.isOtherTabActive()) {
        return;
      }

      this.tabLock.claimSession();
      this.gameStateService.connect(environment.wsUrl, () => {
        this.gameStateService.sendJoinGame(guestPlayerId, activeGameId);
      });

      // Listen for gameState (reconnection success) or actionRejected (session expired)
      this.gameStateService.gameStarted$.pipe(take(1)).subscribe(() => {
        this.router.navigate(['/game']);
      });

      this.gameStateService.actionRejected$.pipe(take(1)).subscribe(() => {
        localStorage.removeItem('active_game_id');
        this.tabLock.releaseSession();
        this.gameStateService.disconnect();
      });
    }
  }
}
