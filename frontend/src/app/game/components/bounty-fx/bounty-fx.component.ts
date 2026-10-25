import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from "@angular/core";
import type { ConsumableEffect } from "@mercury/shared";
import { GameStateService, type BoostFx } from "../../services/game-state.service";
import { SoundService } from "../../services/sound.service";

/** Le pion capturé s'éjecte d'abord : la pièce jaillit juste après l'impact. */
const POP_DELAY_MS = 150;
/** Saut au-dessus de la case (montée, apogée, suspension). */
const HOP_MS = 480;
/** Vol de l'apogée jusqu'au compteur du dock. */
const FLY_MS = 580;
/** Sans compteur visible : la pièce plane un instant puis s'efface sur place. */
const FADE_MS = 360;

/**
 * Un gain de booster : onde et « +1 » (ou « +50 ») sur la case, pièce qui en
 * jaillit. Un malus (« −1 ») n'a que l'onde et le libellé, en rouge.
 * Coordonnées relatives au calque, centre de la case concernée.
 */
interface BountyHit {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly effect: ConsumableEffect;
  readonly loss: boolean;
  /** Arrivée de la pièce relative au départ ; null = pas de compteur visible. */
  readonly dx: number | null;
  readonly dy: number | null;
  /** Taille d'une case du plateau : toute l'animation s'y proportionne. */
  readonly sq: number;
}

/**
 * Boosters qui paient en jeu : à chaque gain du joueur local (pion adverse
 * capturé avec Bounty, coup double avec Homecoming ou Double Strike), une
 * pièce jaillit de la case, tourne sur elle-même au-dessus du plateau puis
 * file vers le jeton du booster dans le dock, dont le compteur avance à son
 * arrivée. Un malus Bounty (pion de son camp capturé) s'inscrit en rouge sur
 * la case, sans pièce : le compteur recule tout de suite.
 *
 * Toujours une seule pièce par gain, même avec Double Coins : le doublement
 * ne se montre et ne se calcule qu'en fin de partie (voir l'écran de fin).
 *
 * Coût maîtrisé : trois mesures de géométrie par capture, puis uniquement des
 * animations CSS de transform/opacity sur quatre nœuds, retirés dès la fin.
 * Rien ne tourne entre deux captures.
 *
 * Monté au niveau de la page de jeu et non dans la table : la table est un
 * conteneur de requêtes (container-type) qui rognerait une pièce partie du
 * plateau. Les coordonnées sont prises relativement au calque lui-même, quel
 * que soit l'ancêtre qui lui sert de bloc conteneur.
 */
@Component({
  selector: "app-bounty-fx",
  templateUrl: "./bounty-fx.component.html",
  styleUrl: "./bounty-fx.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "aria-hidden": "true" },
})
export class BountyFxComponent {
  private gameState = inject(GameStateService);
  private sound = inject(SoundService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly hits = signal<readonly BountyHit[]>([]);

  readonly popDelayMs = POP_DELAY_MS;
  readonly hopMs = HOP_MS;
  readonly flyMs = FLY_MS;
  readonly fadeMs = FADE_MS;

  private seq = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    const sub = this.gameState.boostFx$.subscribe(fx => this.spawn(fx));
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      for (const timer of this.timers) clearTimeout(timer);
      // Une pièce en vol ne doit pas geler le compteur de la partie suivante.
      this.gameState.coinsInFlight.set({});
    });
  }

  private spawn({ square, effect, amount }: BoostFx): void {
    // Mouvement réduit : pas de vol, le compteur avance tout de suite.
    if (this.prefersReducedMotion()) return;
    const loss = amount < 0;

    const source = document.querySelector<HTMLElement>(`app-board [data-sq="${square}"]`);
    if (!source) return;
    const layer = this.host.nativeElement.getBoundingClientRect();
    const from = source.getBoundingClientRect();
    const x = from.left + from.width / 2 - layer.left;
    const y = from.top + from.height / 2 - layer.top;

    // Cible : le jeton du booster dans le dock, ou la pastille « +N » qui le
    // résume quand il est replié. Absente (overlay du 7 ouvert, dock démonté)
    // ou invisible : la pièce s'efface sur place, le compteur avance.
    const target = (
      document.querySelector<HTMLElement>(`app-boost-dock [data-effect="${effect}"]`) ??
      document.querySelector<HTMLElement>("app-boost-dock .boost-dock__more")
    )?.getBoundingClientRect();
    const fly = !loss && !!target && target.width > 0;

    const hit: BountyHit = {
      id: this.seq++,
      x,
      y,
      label: `${loss ? "−" : "+"}${Math.abs(amount)}`,
      effect,
      loss,
      dx: fly ? target!.left + target!.width / 2 - layer.left - x : null,
      dy: fly ? target!.top + target!.height / 2 - layer.top - y : null,
      sq: from.width,
    };
    this.hits.update((list) => [...list, hit]);
    if (!loss) {
      this.later(
        () => (amount >= 50 ? this.sound.playCoinJackpot() : this.sound.playCoinSpend(1)),
        POP_DELAY_MS,
      );
    }

    const end = POP_DELAY_MS + HOP_MS + (fly ? FLY_MS : FADE_MS);
    if (fly) {
      // Le compteur n'avance qu'à l'arrivée de la pièce.
      this.inFlight(effect, amount);
      this.later(() => this.inFlight(effect, -amount), end);
    }
    this.later(() => this.hits.update((list) => list.filter((h) => h.id !== hit.id)), end + 60);
  }

  private inFlight(effect: ConsumableEffect, delta: number): void {
    this.gameState.coinsInFlight.update((map) => ({
      ...map,
      [effect]: Math.max(0, (map[effect] ?? 0) + delta),
    }));
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== timer);
      fn();
    }, ms);
    this.timers.push(timer);
  }

  private prefersReducedMotion(): boolean {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }
}
