import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { Capacitor } from '@capacitor/core';
import { environment } from 'src/environments/environment';

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    picture: string;
    points: number;
    ranking: number;
}

const STORAGE_KEY = 'auth_user';
const ID_TOKEN_KEY = 'auth_id_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private http = inject(HttpClient);

    readonly user$ = new BehaviorSubject<AuthUser | null>(this.loadStoredUser());
    private idToken: string | null = localStorage.getItem(ID_TOKEN_KEY);

    getIdToken(): string | null {
        return this.idToken;
    }

    async getFreshIdToken(): Promise<string | null> {
        const token = this.idToken;
        if (!token) return null;
        // Le session token émis par le backend est long-lived (~27 ans) donc on
        // ne tente pas de refresh. Si pour une raison quelconque il est expiré,
        // l'UI demandera à l'utilisateur de se reconnecter (cas extrême).
        if (this.isTokenExpiredOrExpiringSoon(token)) return null;
        return token;
    }

    private isTokenExpiredOrExpiringSoon(token: string): boolean {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
            const payload = JSON.parse(atob(padded)) as { exp?: number };
            if (!payload.exp) return false;
            return Date.now() >= (payload.exp - 60) * 1000;
        } catch {
            return false;
        }
    }
    readonly loginError$ = new Subject<'google' | 'server'>();
    readonly updateError$ = new Subject<string>();
    readonly isLoading$ = new BehaviorSubject<boolean>(false);

    constructor() {
        const platform = Capacitor.getPlatform();
        console.log('[Auth] Platform:', platform);
        console.log('[Auth] Initializing GoogleSignIn with clientId:', environment.googleClientId);

        void GoogleSignIn.initialize({
            clientId: environment.googleClientId,
            scopes: ['https://www.googleapis.com/auth/userinfo.profile'],
            redirectUrl: window.location.origin
        });

        // On web, signIn() redirects the page to Google and the promise never resolves.
        // When Google redirects back, the id_token is in the URL hash — handle it here.
        if (window.location.hash.includes('id_token')) {
            console.log('[Auth] id_token found in URL hash, handling redirect callback...');
            void this.handleRedirectCallback();
        }
    }

    async login(): Promise<void> {
        const platform = Capacitor.getPlatform();
        console.log('[Auth] login() called, platform:', platform);
        this.isLoading$.next(true);
        try {
            // // Clear any stale Credential Manager state (fixes GMS code 16 on Android)
            // try { await GoogleSignIn.signOut(); } catch (_) { }
            console.log('[Auth] Calling GoogleSignIn.signIn()...');
            const result = await GoogleSignIn.signIn();
            console.log('[Auth] GoogleSignIn.signIn() result:', JSON.stringify(result));

            if (result.idToken) {
                console.log('[Auth] idToken received, length:', result.idToken.length);
                await this.verifyTokenWithServer(result.idToken);
            } else {
                console.warn('[Auth] No idToken in result — on Android this is unexpected. Full result:', JSON.stringify(result));
            }
        } catch (err) {
            console.error('[Auth] GoogleSignIn.signIn() error:', err);
            if (err instanceof Error) {
                console.error('[Auth] Error name:', err.name);
                console.error('[Auth] Error message:', err.message);
                console.error('[Auth] Error stack:', err.stack);
            } else {
                console.error('[Auth] Raw error (non-Error object):', JSON.stringify(err));
            }
            this.loginError$.next('google');
        } finally {
            this.isLoading$.next(false);
        }
    }

    // Extraction de la logique de vérification pour la réutiliser
    private async verifyTokenWithServer(idToken: string): Promise<void> {
        console.log('[Auth] Verifying idToken with server at:', environment.apiUrl);
        try {
            const response = await firstValueFrom(
                this.http.post<AuthUser & { sessionToken?: string }>(`${environment.apiUrl}/api/auth/google`, { idToken })
            );
            const { sessionToken, ...user } = response;
            console.log('[Auth] Server verification success, user:', user.email);
            this.user$.next(user);
            // Stocker le session token long-lived plutôt que le Google ID token (1h).
            const tokenToStore = sessionToken ?? idToken;
            this.idToken = tokenToStore;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
            localStorage.setItem(ID_TOKEN_KEY, tokenToStore);
        } catch (err) {
            console.error('[Auth] Server verification error:', err);
            if (err instanceof HttpErrorResponse) {
                console.error('[Auth] HTTP status:', err.status);
                console.error('[Auth] HTTP error body:', JSON.stringify(err.error));
            }
            const isServerError = err instanceof HttpErrorResponse && err.status >= 500;
            this.loginError$.next(isServerError ? 'server' : 'google');
            throw err;
        }
    }

    async updateProfile(name: string, picture: string): Promise<void> {
        const user = this.user$.getValue();
        if (!user) return;
        try {
            const updatedUser = await firstValueFrom(
                this.http.patch<AuthUser>(`${environment.apiUrl}/api/auth/user/${user.id}`, { name, picture })
            );
            this.user$.next(updatedUser);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
        } catch (err) {
            let message = 'Failed to update profile. Please try again.';
            if (err instanceof HttpErrorResponse) {
                if (err.status === 413) {
                    message = 'Image is too large. Please choose a smaller image (max 2 MB).';
                } else if ((err.error as { error?: string })?.error) {
                    message = (err.error as { error: string }).error;
                }
            }
            this.updateError$.next(message);
            throw err;
        }
    }

    async loginAsWorker(username: string, password: string): Promise<void> {
        this.isLoading$.next(true);
        try {
            const resp = await firstValueFrom(
                this.http.post<{ user: AuthUser; sessionToken: string }>(
                    `${environment.apiUrl}/api/auth/worker`, { username, password }
                )
            );
            this.user$.next(resp.user);
            this.idToken = resp.sessionToken;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(resp.user));
            localStorage.setItem(ID_TOKEN_KEY, resp.sessionToken);
        } catch {
            this.loginError$.next('server');
            throw new Error('Invalid credentials');
        } finally {
            this.isLoading$.next(false);
        }
    }

    async deleteAccount(): Promise<void> {
        const user = this.user$.getValue();
        if (!user) return;
        const token = this.getIdToken();
        await firstValueFrom(
            this.http.delete(`${environment.apiUrl}/api/auth/user/${user.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
        );
        await this.logout();
    }

    async logout(): Promise<void> {
        await GoogleSignIn.signOut();
        this.user$.next(null);
        this.idToken = null;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ID_TOKEN_KEY);
    }

    private async handleRedirectCallback(): Promise<void> {
        this.isLoading$.next(true);
        try {
            const { idToken } = await GoogleSignIn.handleRedirectCallback();
            if (idToken) {
                await this.verifyTokenWithServer(idToken);
            }
        } catch (err) {
            console.error('Google redirect callback error:', err);
        } finally {
            this.isLoading$.next(false);
            history.replaceState(null, '', window.location.pathname);
        }
    }

    private loadStoredUser(): AuthUser | null {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? (JSON.parse(stored) as AuthUser) : null;
    }
}
