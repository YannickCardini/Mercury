import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';

interface VersionInfo {
  latestVersionCode: number;
  latestVersionName: string;
  minVersionCode: number;
  storeUrl: string;
}

const DEFAULT_STORE_URL =
  'https://play.google.com/store/apps/details?id=online.mercury.game';

/**
 * Compare la version installée (Android `versionCode`) à la dernière version
 * publiée, servie par notre propre backend (`GET /api/version`). Si une version
 * plus récente existe, lève le drapeau `updateAvailable` qui déclenche le popup
 * de mise à jour obligatoire rendu au niveau de l'app.
 *
 * Garanties :
 *  - Ne fait jamais rien hors Android natif (le web ne doit jamais voir le popup).
 *  - Échoue silencieusement : une erreur réseau ne bloque ni ne casse l'app.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private http = inject(HttpClient);

  /** True dès qu'une version plus récente est disponible sur le Play Store. */
  readonly updateAvailable = signal(false);
  /** Lien Play Store à ouvrir depuis le popup. */
  readonly storeUrl = signal(DEFAULT_STORE_URL);

  /** Garde contre les vérifications concurrentes (rafale resume/visibilitychange). */
  private checking = false;

  async check(): Promise<void> {
    // Déjà signalé : le popup est affiché, inutile de re-vérifier.
    if (this.updateAvailable()) return;
    // Web (et iOS le cas échéant) : jamais de popup.
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    if (this.checking) return;
    this.checking = true;

    try {
      // `build` correspond au `versionCode` Android (string → number).
      const { build } = await App.getInfo();
      const installed = Number(build);
      if (!Number.isFinite(installed)) return;

      const info = await firstValueFrom(
        this.http.get<VersionInfo>(`${environment.apiUrl}/api/version`)
      );
      if (info.storeUrl) this.storeUrl.set(info.storeUrl);
      if (installed < info.latestVersionCode) {
        this.updateAvailable.set(true);
      }
    } catch {
      // Réseau coupé / backend indisponible → comportement inchangé, pas de popup.
    } finally {
      this.checking = false;
    }
  }
}
