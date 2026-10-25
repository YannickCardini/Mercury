import { Injectable, signal } from '@angular/core';

/**
 * Un booster à équiper, transmis d'un écran à l'autre : la vitrine (/boosters)
 * le dépose, la fenêtre du profil de l'accueil le reprend à son ouverture et
 * le pose sur le présentoir. Les boosters s'équipent dans le profil ; c'est ce
 * service qui y mène sans rien redemander au joueur.
 */
@Injectable({ providedIn: 'root' })
export class BoosterIntentService {
  private readonly held = signal<string | null>(null);

  /** Demande d'ouvrir le profil sur l'équipement, avec ce booster en main. */
  request(boostId: string): void {
    this.held.set(boostId);
  }

  /** Demande d'ouvrir le profil sur l'équipement, sans booster en main. */
  requestOpen(): void {
    this.held.set('');
  }

  /**
   * La demande en attente, consommée : null s'il n'y en a pas, '' pour une
   * simple ouverture, sinon l'id du booster à poser.
   */
  take(): string | null {
    const held = this.held();
    this.held.set(null);
    return held;
  }
}
