import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, take } from 'rxjs';
import { version } from '../../../../package.json';
import { GameStateService } from '../game/services/game-state.service';
import { TabLockService } from '../game/services/tab-lock.service';
import type { MarbleColor } from '@keezen/shared';
import { environment } from 'src/environments/environment';
import { generateGuestName } from '../shared/guest-name';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [CommonModule, FormsModule],
})
export class HomePage implements OnInit, OnDestroy {
  readonly titleLetters = ['K', 'E', 'E', 'N', 'Z', 'E', 'N'];
  readonly appVersion = version;

  showLogin = false;
  showSettings = false;
  showRules = false;
  showMatchmaking = false;
  loginMode: 'login' | 'signup' = 'login';

  // ── Matchmaking state ──────────────────────────────────────────────────────
  matchmakingConnected = 0;
  myMatchmakingColor: MarbleColor | null = null;

  private matchmakingSub: Subscription | null = null;
  private gameStartSub: Subscription | null = null;
  private connectionErrorSub: Subscription | null = null;

  /** Shown when the user tries to open matchmaking while another tab is active. */
  duplicateTabMessage = false;
  /** Shown when the WebSocket fails to connect. */
  matchmakingError = false;

  constructor(private router: Router, private gameStateService: GameStateService, private tabLock: TabLockService) { }
  ngOnInit() { }

  ngOnDestroy(): void {
    this.cleanupMatchmaking();
  }

  openLogin() { this.showLogin = true; }
  closeLogin() { this.showLogin = false; }
  switchMode(mode: 'login' | 'signup') { this.loginMode = mode; }

  openSettings() { this.showSettings = true; }
  closeSettings() { this.showSettings = false; }

  openRules() { this.showRules = true; }
  closeRules() { this.showRules = false; }

  // ── Matchmaking ────────────────────────────────────────────────────────────

  async openMatchmaking(): Promise<void> {
    // Prevent duplicate matchmaking from multiple tabs
    if (await this.tabLock.isOtherTabActive()) {
      this.duplicateTabMessage = true;
      setTimeout(() => this.duplicateTabMessage = false, 4000);
      return;
    }

    this.tabLock.claimSession();
    this.showMatchmaking = true;
    this.matchmakingConnected = 0;
    this.myMatchmakingColor = null;

    this.gameStateService.connect(environment.wsUrl, () => {
      this.gameStateService.sendJoinMatchmaking(generateGuestName());
    });

    this.matchmakingSub = this.gameStateService.matchmakingStatus$.subscribe(status => {
      this.matchmakingConnected = status.connectedCount;
      this.myMatchmakingColor = status.myColor;
    });

    this.gameStartSub = this.gameStateService.gameStarted$.pipe(take(1)).subscribe(() => {
      this.gameStateService.myPlayerColor.set(this.myMatchmakingColor);
      this.cleanupMatchmaking();
      this.showMatchmaking = false;
      this.router.navigate(['/game']);
    });

    this.connectionErrorSub = this.gameStateService.connectionError$.pipe(take(1)).subscribe(() => {
      this.cleanupMatchmaking();
      this.gameStateService.disconnect();
      this.tabLock.releaseSession();
      this.showMatchmaking = false;
      this.matchmakingError = true;
      setTimeout(() => this.matchmakingError = false, 4000);
    });

  }

  cancelMatchmaking(): void {
    this.cleanupMatchmaking();
    this.gameStateService.disconnect();
    this.tabLock.releaseSession();
    this.showMatchmaking = false;
  }

  private cleanupMatchmaking(): void {
    this.matchmakingSub?.unsubscribe();
    this.gameStartSub?.unsubscribe();
    this.connectionErrorSub?.unsubscribe();
    this.matchmakingSub = null;
    this.gameStartSub = null;
    this.connectionErrorSub = null;
  }
}
