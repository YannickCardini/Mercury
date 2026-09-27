import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import {
  BOOST_MULTIPLIER,
  MarbleColor,
  boostMultiplier,
  hasBoost,
  type ConsumableEffect,
} from "@mercury/shared";
import { SoundService } from "../../services/sound.service";
import { BoostTokenComponent } from "../../../shared/boost-token.component";

/** Durée du vol d'une pièce, hors décalage de départ. */
const COIN_FLIGHT_MS = 620;
/** Écart de départ entre deux pièces successives. */
const COIN_STAGGER_MS = 85;
/**
 * Délai avant de seulement envisager d'animer les pièces. L'overlay vient de
 * monter : entrée de la card, 40 confettis, halos. On lui laisse finir avant
 * d'ajouter quoi que ce soit, car c'est le moment le plus chargé sur mobile.
 */
const SETTLE_MS = 700;
/** Au-delà, on joue l'animation même si l'appareil n'a jamais été au repos. */
const IDLE_TIMEOUT_MS = 900;
/**
 * Plafond de pièces en vol. L'économie en accorde 8 au maximum, donc le vol
 * est fidèle au gain en pratique ; le plafond n'existe que pour qu'un futur
 * barème plus généreux ne puisse pas faire naître cent noeuds animés.
 */
const MAX_FLYING_COINS = 12;
/**
 * Double Coins : pause entre l'arrivée de la dernière pièce et le début du
 * doublement, le temps que le sceau « ×2 » se pose et se lise.
 */
const STAMP_MS = 520;
/** Double Coins : écart entre deux incréments du compteur pendant le doublement. */
const DOUBLE_STEP_MS = 70;

/** Un joueur affiché sur l'écran de fin de partie (gagnant ou perdant). */
export interface VictoryPlayer {
  color: MarbleColor;
  name: string;
  /** Photo de profil ; absente → bille planète de la couleur du joueur. */
  picture?: string;
  /** Vrai pour le joueur local (badge « You »). */
  isMe?: boolean;
  /** Nombre de pions rentrés dans la zone d'arrivée (0..4) — remplit les slots. */
  arrivalCount: number;
}

interface ConfettiPiece {
  id: number;
  styles: { [key: string]: string };
}

/** Une pièce gagnée en vol du trophée vers le compteur. Coordonnées scène. */
interface FlyingCoin {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly lift: number;
  readonly delay: number;
}

@Component({
  selector: "app-victory-overlay",
  templateUrl: "./victory-overlay.component.html",
  styleUrl: "./victory-overlay.component.scss",
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [NgTemplateOutlet, BoostTokenComponent],
})
export class VictoryOverlayComponent {
  /** Gagnant(s) : un seul en 1v3, les deux coéquipiers en 2v2. */
  winners = input.required<ReadonlyArray<VictoryPlayer>>();
  /** Perdant(s) : trois en 1v3, les deux coéquipiers adverses en 2v2. */
  losers = input<ReadonlyArray<VictoryPlayer>>([]);
  isWinner = input.required<boolean>();
  byDefault = input<boolean>(false);
  isGuest = input<boolean>(false);
  pointsDelta = input<number | null>(null);
  newPoints = input<number | null>(null);
  newRanking = input<number | null>(null);
  /** Pièces de boutique gagnées. null = partie perdue, ou joueur non crédité. */
  coinsDelta = input<number | null>(null);
  /** Boosters actifs du joueur sur cette partie (ids catalogue). Les montants
   *  ci-dessus les intègrent déjà ; la liste sert à l'expliquer. */
  boosts = input<readonly string[]>([]);
  /** Origine des pièces avant Double Coins (victoire, captures Bounty). */
  coinsBase = input<{ victory: number; captures: number } | null>(null);

  backToMenu = output<void>();

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private sound = inject(SoundService);

  /** Les 4 slots d'arrivée de chaque joueur (index < arrivalCount → rempli). */
  readonly slotIndices = [0, 1, 2, 3] as const;

  // ── Boosters ───────────────────────────────────────────────────────────────

  readonly pointsBoosted = computed(() => boostMultiplier(this.boosts(), "double_points") > 1);
  readonly coinsBoosted = computed(() => boostMultiplier(this.boosts(), "double_coins") > 1);
  readonly victoryCoins = computed(() => this.coinsBase()?.victory ?? 0);
  readonly captureCoins = computed(() => this.coinsBase()?.captures ?? 0);
  /**
   * Boosters consommés sans rien rapporter : on le dit, sinon le joueur
   * cherche en vain le gain qu'il a payé. Seulement une fois les stats reçues.
   */
  readonly unusedBoosts = computed<readonly { effect: ConsumableEffect; text: string }[]>(() => {
    if (this.pointsDelta() === null) return [];
    const notes: { effect: ConsumableEffect; text: string }[] = [];
    if (hasBoost(this.boosts(), "capture_coins") && this.captureCoins() === 0) {
      notes.push({ effect: "capture_coins", text: "Bounty used. No enemy marble captured this game." });
    }
    if (this.coinsBoosted() && this.coinsDelta() === null) {
      notes.push({ effect: "double_coins", text: "Double Coins used. No coins to double this game." });
    }
    return notes;
  });
  /** Le sceau « ×2 » des pièces s'est posé (après le vol, avant le doublement). */
  readonly coinsStamped = signal(false);

  // ── Récolte des pièces gagnées ─────────────────────────────────────────────
  //
  // Le montant seul ne se remarquait pas au milieu des points, du rang et des
  // confettis. Une pièce par pièce gagnée jaillit du trophée et se range dans
  // le compteur, qui monte au rythme des arrivées : le joueur voit ce qu'il a
  // gagné au lieu de le lire.

  /** Pièces actuellement en vol. Vidé dès la dernière arrivée. */
  readonly flyingCoins = signal<readonly FlyingCoin[]>([]);
  /** Pièces déjà atterries : la valeur affichée par le compteur. */
  readonly coinsShown = signal(0);
  /** La pastille reste transparente (mais présente) jusqu'à la 1re arrivée. */
  readonly coinsRevealed = signal(false);
  /** Toutes les pièces sont rentrées : éclat final. */
  readonly coinsComplete = signal(false);

  private flightStarted = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.timers) clearTimeout(timer);
    });

    effect(() => {
      const delta = this.coinsDelta();
      if (delta === null) return;
      untracked(() => this.scheduleCoinFlight(delta));
    });
  }

  private scheduleCoinFlight(total: number): void {
    if (this.flightStarted) return;
    this.flightStarted = true;

    if (total <= 0 || this.prefersReducedMotion()) {
      this.settleInstantly(total);
      return;
    }

    // Double Coins : seul le gain de base vole, le sceau double ensuite. Le
    // joueur voit ce qu'il aurait eu, puis ce que le booster y a ajouté.
    const known = this.coinsBase();
    const base = !this.coinsBoosted()
      ? total
      : known
        ? known.victory + known.captures
        : Math.max(1, Math.round(total / BOOST_MULTIPLIER));

    this.later(() => {
      // requestIdleCallback : les pièces n'arrivent qu'une fois le navigateur
      // libéré. Le timeout garantit qu'elles finissent par se jouer même sur un
      // appareil qui ne respire jamais.
      const idle = window.requestIdleCallback?.bind(window);
      if (idle) idle(() => this.launchCoins(base, total), { timeout: IDLE_TIMEOUT_MS });
      else this.launchCoins(base, total);
    }, SETTLE_MS);
  }

  /** `base` pièces volent vers le compteur ; si `total` est plus grand, le sceau double ensuite. */
  private launchCoins(base: number, total: number): void {
    const root = this.host.nativeElement;
    const stage = root.querySelector('.coin-flights');
    const source = root.querySelector('.trophy');
    const target = root.querySelector('.stats-coins');
    if (!stage || !source || !target) {
      this.settleInstantly(total);
      return;
    }

    // Coordonnées relatives à la scène, jamais au viewport : le backdrop-filter
    // de .victory-overlay en fait un bloc conteneur, donc un enfant positionné
    // s'ancre sur lui et non sur l'écran.
    const stageRect = stage.getBoundingClientRect();
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const tx = to.left + to.width / 2 - stageRect.left;
    const ty = to.top + to.height / 2 - stageRect.top;

    const count = Math.min(base, MAX_FLYING_COINS);
    const coins: FlyingCoin[] = Array.from({ length: count }, (_, i) => {
      // Départ éparpillé dans le trophée, arrivée franche sur la pastille : les
      // pièces jaillissent de la victoire puis se rangent dans le compteur.
      const sx =
        from.left + from.width / 2 - stageRect.left + (Math.random() - 0.5) * from.width * 0.7;
      const sy =
        from.top + from.height / 2 - stageRect.top + (Math.random() - 0.5) * from.height * 0.5;
      return {
        id: i,
        x: sx,
        y: sy,
        dx: tx - sx,
        dy: ty - sy,
        lift: 26 + Math.random() * 40,
        delay: i * COIN_STAGGER_MS,
      };
    });

    this.flyingCoins.set(coins);
    // Décalé d'un vol complet, au pas du visuel : ici le tintement est celui de
    // pièces qui *arrivent*, pas de pièces qui partent comme en boutique.
    this.later(() => this.sound.playCoinSpend(count, COIN_STAGGER_MS), COIN_FLIGHT_MS);

    coins.forEach((coin, i) => {
      this.later(() => {
        this.coinsRevealed.set(true);
        this.coinsShown.update(n => n + 1);
        if (i === count - 1) this.finishCoinFlight(base, total);
      }, coin.delay + COIN_FLIGHT_MS);
    });
  }

  /** Dernière arrivée : on libère les noeuds animés et on cale la vraie valeur. */
  private finishCoinFlight(base: number, total: number): void {
    this.coinsShown.set(base); // si le plafond a tronqué le vol, le compteur dit vrai
    this.flyingCoins.set([]);
    if (total > base) {
      this.stampAndDouble(base, total);
      return;
    }
    this.coinsComplete.set(true);
  }

  /**
   * Double Coins : le sceau « ×2 » se pose sur la pastille, puis le compteur
   * monte de la base au total au rythme d'un tintement par pièce ajoutée.
   */
  private stampAndDouble(base: number, total: number): void {
    this.coinsStamped.set(true);
    this.sound.playUnlock();
    const extra = total - base;
    this.later(() => this.sound.playCoinSpend(extra, DOUBLE_STEP_MS), STAMP_MS);
    for (let k = 1; k <= extra; k++) {
      this.later(() => {
        this.coinsShown.set(base + k);
        if (k === extra) this.coinsComplete.set(true);
      }, STAMP_MS + k * DOUBLE_STEP_MS);
    }
  }

  /** Pas d'animation : la pastille prend directement sa valeur finale. */
  private settleInstantly(total: number): void {
    this.coinsShown.set(total);
    this.coinsRevealed.set(true);
    this.coinsStamped.set(this.coinsBoosted());
    this.coinsComplete.set(true);
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers = this.timers.filter(t => t !== timer);
      fn();
    }, ms);
    this.timers.push(timer);
  }

  private prefersReducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false; // matchMedia indisponible (WebView ancienne) : on anime
    }
  }

  /**
   * Nom court affiché : prénom seul, tronqué par CSS si trop long — même
   * logique que `PlayerBadgeComponent.displayName` pour garantir qu'un nom
   * de joueur ne déborde jamais de la card.
   */
  displayName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '';
    return trimmed.split(/\s+/)[0];
  }

  readonly particles: ConfettiPiece[] = Array.from({ length: 40 }, (_, i) => {
    const colors = [
      "#dc2626",
      "#22c55e",
      "#3b82f6",
      "#fb923c",
      "#f0c040",
      "#a855f7",
      "#ffffff",
      "#fb7185",
    ];
    const isCircle = i % 3 === 0;
    return {
      id: i,
      styles: {
        left: `${(i / 40) * 100 + (((i * 7) % 5) - 2)}%`,
        "animation-delay": `${((i * 0.13) % 3).toFixed(2)}s`,
        "animation-duration": `${(2.2 + ((i * 0.11) % 2)).toFixed(2)}s`,
        background: colors[i % colors.length]!,
        width: `${6 + (i % 8)}px`,
        height: `${6 + (i % 8)}px`,
        "border-radius": isCircle ? "50%" : "2px",
        transform: `rotate(${(i * 47) % 360}deg)`,
      },
    };
  });
}
