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

@Injectable({ providedIn: 'root' })
export class AuthService {
    private http = inject(HttpClient);

    readonly user$ = new BehaviorSubject<AuthUser | null>(this.loadStoredUser());
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
            const user = await firstValueFrom(
                this.http.post<AuthUser>(`${environment.apiUrl}/api/auth/google`, { idToken })
            );
            console.log('[Auth] Server verification success, user:', user.email);
            this.user$.next(user);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
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

    async logout(): Promise<void> {
        await GoogleSignIn.signOut();
        this.user$.next(null);
        localStorage.removeItem(STORAGE_KEY);
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
