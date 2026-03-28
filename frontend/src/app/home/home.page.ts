import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, take } from 'rxjs';
import { version } from '../../../../package.json';
import { GameStateService } from '../game/services/game-state.service';
import { TabLockService } from '../game/services/tab-lock.service';
import { AuthService, type AuthUser } from '../services/auth.service';
import type { MarbleColor } from '@mercury/shared';
import { environment } from 'src/environments/environment';
import { generateGuestName } from '../shared/guest-name';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [CommonModule, FormsModule],
})
export class HomePage implements OnInit, OnDestroy {
  readonly titleLetters = ['M', 'E', 'R', 'C', 'U', 'R', 'Y'];
  readonly appVersion = version;

  showLogin = false;
  showSettings = false;
  showRules = false;
  showMatchmaking = false;
  loginMode: 'login' | 'signup' = 'login';

  // ── Edit profile state ─────────────────────────────────────────────────────
  editingProfile = false;
  editName = '';
  editPreviewUrl = '';
  editPictureDataUrl = '';
  isSaving = false;
  editError = '';
  private updateErrorSub: Subscription | null = null;

  // ── Matchmaking state ──────────────────────────────────────────────────────
  matchmakingConnected = 0;
  myMatchmakingColor: MarbleColor | null = null;

  private matchmakingSub: Subscription | null = null;
  private gameStartSub: Subscription | null = null;
  private connectionErrorSub: Subscription | null = null;
  private loginErrorSub: Subscription | null = null;

  /** Shown when the user tries to open matchmaking while another tab is active. */
  duplicateTabMessage = false;
  /** Shown when the WebSocket fails to connect. */
  matchmakingError = false;

  loginError = false;
  loginErrorMessage = '';

  constructor(
    private router: Router,
    private gameStateService: GameStateService,
    private tabLock: TabLockService,
    readonly auth: AuthService,
  ) { }

  ngOnInit(): void {
    this.loginErrorSub = this.auth.loginError$.subscribe(type => {
      this.loginErrorMessage = type === 'server'
        ? 'Server error. Please try again later.'
        : 'Could not sign in with Google. Please try again.';
      this.loginError = true;
      setTimeout(() => this.loginError = false, 4000);
    });
    this.updateErrorSub = this.auth.updateError$.subscribe(msg => {
      this.editError = msg;
    });
  }

  ngOnDestroy(): void {
    this.cleanupMatchmaking();
    this.loginErrorSub?.unsubscribe();
    this.updateErrorSub?.unsubscribe();
  }

  openLogin() { this.showLogin = true; }
  closeLogin() { this.showLogin = false; this.editingProfile = false; this.editError = ''; }
  switchMode(mode: 'login' | 'signup') { this.loginMode = mode; }

  toggleEditProfile(user: AuthUser): void {
    this.editingProfile = !this.editingProfile;
    if (this.editingProfile) {
      this.editName = user.name;
      this.editPreviewUrl = user.picture;
      this.editPictureDataUrl = user.picture;
      this.editError = '';
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.editError = 'Only JPEG, PNG, or WebP images are allowed.';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.editError = 'Image must be under 2 MB.';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 512 || img.naturalHeight > 512) {
          this.editError = 'Image dimensions must not exceed 512×512 px.';
          return;
        }
        this.editPreviewUrl = dataUrl;
        this.editPictureDataUrl = dataUrl;
        this.editError = '';
      };
      img.onerror = () => { this.editError = 'Could not read image.'; };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async saveProfile(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    this.editError = '';
    try {
      await this.auth.updateProfile(this.editName, this.editPictureDataUrl);
      this.editingProfile = false;
    } catch {
      // editError already set via updateError$ subscription
    } finally {
      this.isSaving = false;
    }
  }

  async loginWithGoogle(): Promise<void> {
    try {
      await this.auth.login();
      this.closeLogin();
    } catch (err) {
      console.error('Google login error:', err);
      this.loginErrorMessage = 'Could not sign in with Google. Please try again.';
      this.loginError = true;
      setTimeout(() => this.loginError = false, 4000);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }

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

    const user = this.auth.user$.getValue();
    const playerName = user?.name ?? generateGuestName();
    const playerPicture = user?.picture;
    const userId = user?.id;
    this.gameStateService.connect(environment.wsUrl, () => {
      this.gameStateService.sendJoinMatchmaking(playerName, playerPicture, userId);
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
