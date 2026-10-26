import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { Capacitor } from "@capacitor/core";
import { getConsumable, type ConsumableEffect, type ConsumableShopItem } from "@mercury/shared";
import { GameStateService, LIVE_EFFECTS } from "../../services/game-state.service";
import { BoostTokenComponent } from "../../../shared/boost-token.component";

/** Durée de l'éclosion des jetons au début de la partie (anneau + pop). */
const POP_MS = 1100;
/**
 * Éléments montrés au plus dans la pastille : au-delà, les derniers jetons se
 * résument en « +N ». Trois tiennent à côté de la pastille des secondes sur un
 * téléphone de 360px, quel que soit le nombre d'emplacements du joueur.
 */
const MAX_VISIBLE = 3;

/**
 * Boosters actifs du joueur local pendant la partie.
 *
 * Toujours visible à côté du bouton de réactions : un booster qui double la
 * perte ne doit jamais se faire oublier en cours de partie. Au lancement, les
 * jetons éclosent pour se signaler ; la bulle qui explique chaque effet ne
 * s'ouvre qu'au tap sur les jetons. La pastille garde sa taille quel que soit
 * le nombre de boosters : au-delà de MAX_VISIBLE, un « +N » les résume et la
 * bulle les liste tous.
 */
@Component({
  selector: "app-boost-dock",
  templateUrl: "./boost-dock.component.html",
  styleUrl: "./boost-dock.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoostTokenComponent],
  host: {
    "[class.is-native]": "isNative",
    // Écoute au niveau du document plutôt qu'un voile cliquable : sur Android
    // un voile inséré sous le doigt reçoit le clic fantôme du même tap et
    // referme aussitôt la bulle (cf. TOGGLE_GUARD_MS des réactions).
    "(document:pointerdown)": "onDocumentPointerDown($event)",
  },
})
export class BoostDockComponent {
  readonly isNative = Capacitor.isNativePlatform();

  private gameState = inject(GameStateService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Boosters du joueur local : d'abord ceux qui paient en jeu (leur compteur
   * bouge, il doit rester visible), puis les autres, chacun dans l'ordre reçu.
   */
  readonly boosts = computed<readonly ConsumableShopItem[]>(() => {
    const items = this.gameState.myBoosts().flatMap((id) => {
      const item = getConsumable(id);
      return item ? [item] : [];
    });
    const live = (b: ConsumableShopItem) => LIVE_EFFECTS.includes(b.effect);
    return [...items.filter(live), ...items.filter((b) => !live(b))];
  });

  /** Jetons de la pastille ; avec un « +N », il prend la place du dernier. */
  readonly visible = computed(() => {
    const all = this.boosts();
    return all.length > MAX_VISIBLE ? all.slice(0, MAX_VISIBLE - 1) : all;
  });
  readonly hiddenCount = computed(() => this.boosts().length - this.visible().length);

  /** Pièces déjà arrivées au compteur de chaque jeton (les pièces en vol n'y sont pas encore). */
  readonly coins = this.gameState.boostCoinsShown;
  /** Perfect Game encore possible (true), manqué (false), ou pas équipé (null). */
  readonly perfectAlive = this.gameState.perfectAlive;

  coinsOf(effect: ConsumableEffect): number {
    return this.coins()[effect] ?? 0;
  }

  isLive(effect: ConsumableEffect): boolean {
    return LIVE_EFFECTS.includes(effect);
  }

  readonly ariaLabel = computed(() => {
    const parts = this.boosts().map((b) => {
      if (this.isLive(b.effect)) return `${b.label} ${this.coinsOf(b.effect)} coins`;
      if (b.effect === "perfect_win") return `${b.label} ${this.perfectAlive() ? "still on" : "missed"}`;
      return b.label;
    });
    return `Boosters active: ${parts.join(", ")}`;
  });

  /** Bulle d'explication ouverte. */
  readonly open = signal(false);
  /** Jetons en train d'éclore (début de partie). */
  readonly popping = signal(false);

  private popped = false;
  private popTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.popTimer) clearTimeout(this.popTimer);
    });

    // Le tutoriel (z-index 300) se tait tant que la bulle est ouverte : ses
    // hints se posent au-dessus des cartes, là où la bulle déborde.
    this.gameState.publishOverlay("boosts", this.open);

    // Éclosion unique, retardée tant que l'annonce des équipes (2v2) masque le
    // plateau : les boosters arrivent du serveur pendant qu'elle joue, et des
    // jetons éclos derrière elle passeraient inaperçus. La bulle, elle, ne
    // s'ouvre jamais d'elle-même : elle masquait la main en début de partie.
    effect(() => {
      const ready =
        this.boosts().length > 0 &&
        !this.gameState.teamIntroPlaying() &&
        this.gameState.winners().length === 0;
      if (!ready || this.popped) return;
      this.popped = true;
      untracked(() => {
        this.popping.set(true);
        this.popTimer = setTimeout(() => this.popping.set(false), POP_MS);
      });
    });
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.open.set(false);
  }
}
