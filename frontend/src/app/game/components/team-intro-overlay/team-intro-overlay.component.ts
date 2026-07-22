import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  effect,
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
/** Durée plancher d'affichage avant de pouvoir déclencher la sortie (confort
 * de lecture — pas une contrainte technique : la sortie attend aussi
 * `contentReady`, voir plus bas). */
const MIN_DISPLAY_MS = 3600;
/** Durée de l'animation de sortie (bandeaux qui repartent), doit rester
 * synchronisée avec `$slide-duration` dans le SCSS. */
const LEAVE_DURATION_MS = 650;

/**
 * Annonce des équipes en début de partie 2v2 : masque PLEIN ÉCRAN et opaque
 * (l'hôte est en `position: fixed`, indépendant du board-wrapper), qui sert
 * aussi de rideau derrière lequel le board/table (coûteux, ~2000+ nœuds DOM)
 * peuvent être montés sans jank visible pendant l'annonce.
 *
 * Deux bandeaux horizontaux aux couleurs des joueurs (haut = équipe 1 glissant
 * depuis la gauche, bas = équipe 2 depuis la droite) portent avatars et noms ;
 * un flash puis une étoile comic « VS » éclatent au centre.
 *
 * Le parent déclenche l'entrée via `play()`. La sortie (bandeaux qui repartent)
 * n'est déclenchée que lorsque `contentReady` (le board/table sont montés ET
 * réellement peints par le navigateur) devient vrai ET que `MIN_DISPLAY_MS`
 * s'est écoulé — jamais avant, pour ne jamais révéler un board incomplet.
 * Un bouton discret (debug) permet de rejouer l'annonce à la demande.
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
  /** Vrai une fois que le contenu masqué (board/table) est monté ET peint —
   * condition nécessaire (avec le plancher `MIN_DISPLAY_MS`) au démarrage
   * de la sortie. Piloté par GamePage. */
  contentReady = input<boolean>(false);

  /** Vrai tant que la bannière est montée dans le DOM. */
  readonly playing = signal(false);
  /** Vrai pendant le fondu de sortie (désactive aussi les interactions). */
  readonly leaving = signal(false);
  /** Vrai une fois le plancher `MIN_DISPLAY_MS` écoulé depuis le début de l'affichage. */
  private readonly minDisplayElapsed = signal(false);
  readonly debug = environment.debug;

  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    // Démarre la sortie dès que les deux conditions sont réunies — quel que
    // soit l'ordre dans lequel elles surviennent.
    effect(() => {
      if (!this.playing() || this.leaving()) return;
      if (!this.minDisplayElapsed() || !this.contentReady()) return;
      this.leaving.set(true);
      this.timers.push(
        setTimeout(() => {
          this.playing.set(false);
          this.leaving.set(false);
        }, LEAVE_DURATION_MS),
      );
    });
  }

  /** (Re)joue l'annonce depuis le début. */
  play(): void {
    this.clearTimers();
    if (this.playing()) {
      // Replay pendant que la bannière est déjà montée (bouton debug) :
      // démonte le temps d'un tick pour que les animations CSS redémarrent
      // de zéro.
      this.playing.set(false);
      this.leaving.set(false);
      this.timers.push(setTimeout(() => this.startPlaying(), 0));
    } else {
      // Premier montage : pas besoin de délai artificiel.
      this.startPlaying();
    }
  }

  private startPlaying(): void {
    this.playing.set(true);
    this.leaving.set(false);
    this.minDisplayElapsed.set(false);
    this.timers.push(setTimeout(() => this.minDisplayElapsed.set(true), MIN_DISPLAY_MS));
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
