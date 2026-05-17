import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService, type AuthUser } from '../services/auth.service';

interface ProfileResponse {
  name: string;
  picture: string;
  points: number;
  ranking: number;
  createdAt: string;
  lastLogin: string;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  imports: [CommonModule, FormsModule],
})
export class ProfilePage implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private auth = inject(AuthService);

  userId = signal<string>('');
  profile = signal<ProfileResponse | null>(null);
  loading = signal(true);
  error = signal('');

  currentUser = signal<AuthUser | null>(null);
  private userSub: Subscription | null = null;

  // Send-message modal state
  showSendModal = signal(false);
  messageText = signal('');
  sending = signal(false);
  sendStatus = signal<'idle' | 'success' | 'error'>('idle');
  sendError = signal('');

  readonly maxLength = 500;

  ngOnInit(): void {
    this.userSub = this.auth.user$.subscribe(u => this.currentUser.set(u));

    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.userId.set(id);
    if (!id) {
      this.error.set('Invalid profile id.');
      this.loading.set(false);
      return;
    }

    firstValueFrom(
      this.http.get<ProfileResponse>(`${environment.apiUrl}/api/auth/user/${id}`)
    ).then(data => {
      this.profile.set(data);
      this.loading.set(false);
    }).catch(() => {
      this.error.set('Could not load profile.');
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  goBack(): void {
    this.location.back();
  }

  isSelf(): boolean {
    const me = this.currentUser();
    return !!me && me.id === this.userId();
  }

  canSendMessage(): boolean {
    return !!this.currentUser() && !this.isSelf();
  }

  formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatLastSeen(iso: string | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const diffMs = Date.now() - d.getTime();
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    return this.formatDate(iso);
  }

  openSendModal(): void {
    if (!this.canSendMessage()) return;
    this.messageText.set('');
    this.sendStatus.set('idle');
    this.sendError.set('');
    this.showSendModal.set(true);
  }

  closeSendModal(): void {
    if (this.sending()) return;
    this.showSendModal.set(false);
  }

  async sendMessage(): Promise<void> {
    const text = this.messageText().trim();
    if (!text || text.length > this.maxLength) return;
    const idToken = await this.auth.getFreshIdToken();
    if (!idToken) {
      this.sendStatus.set('error');
      this.sendError.set('Please sign in again to send a message.');
      return;
    }

    this.sending.set(true);
    this.sendStatus.set('idle');
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/api/messages`, {
          toUserId: this.userId(),
          text,
        }, {
          headers: { Authorization: `Bearer ${idToken}` },
        })
      );
      this.sendStatus.set('success');
      this.messageText.set('');
      setTimeout(() => {
        if (this.sendStatus() === 'success') this.showSendModal.set(false);
      }, 1200);
    } catch (err) {
      this.sendStatus.set('error');
      let msg = 'Could not send message. Please try again.';
      if (err instanceof HttpErrorResponse) {
        const body = err.error as { error?: string } | undefined;
        if (err.status === 401) msg = 'Your session has expired. Please sign in again.';
        else if (body?.error) msg = body.error;
      }
      this.sendError.set(msg);
    } finally {
      this.sending.set(false);
    }
  }
}
