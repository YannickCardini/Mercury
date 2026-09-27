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
import { getConsumable, type ConsumableShopItem } from "@mercury/shared";
import { GameStateService } from "../../services/game-state.service";
import { BoostTokenComponent } from "../../../shared/boost-token.component";

/** Durée d'affichage de l'annonce automatique au début de la partie. */
const ANNOUNCE_MS = 5000;
/** Durée de l'éclosion des jetons à l'annonce (anneau + pop). */
const POP_MS = 1100;

/**
 * Boosters actifs du joueur local pendant la partie.
 *
 * Toujours visible à côté du bouton de réactions : un booster qui double la
 * perte ne doit jamais se faire oublier en cours de partie. Au lancement, une
 * bulle explique chaque effet quelques secondes puis se replie ; un tap sur
 * les jetons la rouvre.
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

  /** Boosters du joueur local, dans l'ordre reçu du serveur. */
  readonly boosts = computed<readonly ConsumableShopItem[]>(() =>
    this.gameState.myBoosts().flatMap((id) => {
      const item = getConsumable(id);
      return item ? [item] : [];
    })
  );

  /** Pièces Bounty déjà arrivées au compteur (les pièces en vol n'y sont pas encore). */
  readonly bountyCoins = this.gameState.bountyCoinsShown;

  readonly ariaLabel = computed(() => {
    const names = this.boosts().map((b) => b.label).join(", ");
    const bounty = this.gameState.hasBounty() ? `, ${this.bountyCoins()} bounty coins` : "";
    return `Boosters active: ${names}${bounty}`;
  });

  /** Bulle d'explication ouverte. */
  readonly open = signal(false);
  /** Jetons en train d'éclore (annonce de début de partie). */
  readonly popping = signal(false);

  private announced = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private popTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimers());

    // Le tutoriel (z-index 300) se tait tant que la bulle est ouverte : ses
    // hints se posent au-dessus des cartes, là où la bulle déborde.
    this.gameState.publishOverlay("boosts", this.open);

    // Annonce unique, retardée tant que l'annonce des équipes (2v2) masque le
    // plateau : les boosters arrivent du serveur pendant qu'elle joue, et une
    // bulle ouverte derrière elle se refermerait sans avoir été vue.
    effect(() => {
      const ready =
        this.boosts().length > 0 &&
        !this.gameState.teamIntroPlaying() &&
        this.gameState.winners().length === 0;
      if (!ready || this.announced) return;
      this.announced = true;
      untracked(() => this.announce());
    });
  }

  toggle(): void {
    this.cancelAutoClose();
    this.open.update((v) => !v);
  }

  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.cancelAutoClose();
    this.open.set(false);
  }

  private announce(): void {
    this.popping.set(true);
    this.open.set(true);
    this.popTimer = setTimeout(() => this.popping.set(false), POP_MS);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.open.set(false);
    }, ANNOUNCE_MS);
  }

  /** Le joueur a pris la main : la bulle ne se referme plus d'elle-même. */
  private cancelAutoClose(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  private clearTimers(): void {
    this.cancelAutoClose();
    if (this.popTimer) clearTimeout(this.popTimer);
  }
}
