import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  OnDestroy,
} from "@angular/core";
import type { MarbleColor } from "@mercury/shared";
import { environment } from "src/environments/environment";

/** Un joueur affiché dans la bannière d'annonce des équipes. */
export interface TeamIntroPlayer {
  name: string;
  color: MarbleColor;
  picture?: string;
}

// ── Timeline de l'animation (ms) ──────────────────────────────────
// Les délais des keyframes CSS (slide 650, flash à ~720, VS à ~850)
// vivent dans le SCSS ; ici uniquement les bornes gérées en TS.
/** Début du fondu de sortie. */
const FADE_START_MS = 3600;
/** Fin de l'animation (bannière démontée du DOM). */
const TOTAL_MS = 4250;

/**
 * Annonce des équipes en début de partie 2v2, superposée au PLATEAU
 * (l'hôte doit être placé dans un conteneur `position: relative` — le
 * board-wrapper) sans jamais le masquer entièrement ni bloquer le jeu.
 *
 * Deux bandeaux horizontaux aux couleurs des joueurs (haut = équipe 1 glissant
 * depuis la gauche, bas = équipe 2 depuis la droite) portent avatars et noms ;
 * un flash puis une étoile comic « VS » éclatent au centre ; l'ensemble
 * s'efface en fondu.
 *
 * Le parent déclenche l'animation via `play()` ; un bouton discret en haut à
 * droite du plateau permet de la rejouer à la demande.
 */
@Component({
  selector: "app-team-intro-overlay",
  templateUrl: "./team-intro-overlay.component.html",
  styleUrl: "./team-intro-overlay.component.scss",
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [],
})
export class TeamIntroOverlayComponent implements OnDestroy {
  /** Équipe de la bande du HAUT (avatars losange) : [joueur gauche, joueur droit]. */
  topTeam = input.required<ReadonlyArray<TeamIntroPlayer>>();
  /** Équipe de la bande du BAS (avatars ronds) : [joueur gauche, joueur droit]. */
  bottomTeam = input.required<ReadonlyArray<TeamIntroPlayer>>();

  /** Vrai tant que la bannière est montée dans le DOM. */
  readonly playing = signal(false);
  /** Vrai pendant le fondu de sortie (désactive aussi les interactions). */
  readonly leaving = signal(false);
  readonly debug = environment.debug;


  private timers: ReturnType<typeof setTimeout>[] = [];

  /** (Re)joue l'annonce depuis le début. */
  play(): void {
    this.clearTimers();
    // Démonte la bannière le temps d'un tick pour que les animations CSS
    // redémarrent de zéro même si elle était déjà affichée.
    this.playing.set(false);
    this.leaving.set(false);
    this.timers.push(
      setTimeout(() => {
        this.playing.set(true);
        this.timers.push(setTimeout(() => this.leaving.set(true), FADE_START_MS));
        this.timers.push(
          setTimeout(() => {
            this.playing.set(false);
            this.leaving.set(false);
          }, TOTAL_MS),
        );
      }, 0),
    );
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
