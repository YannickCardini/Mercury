import { Injectable, signal } from '@angular/core';

/**
 * Toast applicatif léger, rendu globalement par AppComponent (`.app-toast`
 * dans styles.scss). Utilisé pour tout feedback transitoire : action rejetée
 * par le serveur, reconnexion en cours, partie annulée…
 */
@Injectable({ providedIn: 'root' })
export class ToastService {

  readonly message = signal<string | null>(null);
  readonly kind = signal<'info' | 'error'>('info');

  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, kind: 'info' | 'error' = 'info', durationMs = 3000): void {
    this.message.set(message);
    this.kind.set(kind);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.message.set(null);
      this.timer = null;
    }, durationMs);
  }
}
