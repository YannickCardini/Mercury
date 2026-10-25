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
/**
 * Incréments au plus pour un doublement ou un malus : au-delà, le compteur
 * avance par paquets. Un coup double (+50) doublé ferait sinon tinter cent
 * fois l'écran de fin.
 */
const MAX_COUNT_TICKS = 20;

/** Origine des pièces, telle qu'envoyée par le serveur (champs récents optionnels). */
type CoinsBase = {
  victory: number;
  captures: number;
  allyPenalty?: number;
  pairHome?: number;
  pairCapture?: number;
};

/** Une ligne de l'origine des pièces, sous la pastille. */
interface CoinPart {
  readonly label: string;
  /** Signé : le malus Bounty est négatif. */
  readonly amount: number;
  /** Booster d'où vient la part ; null pour la victoire. */
  readonly effect: ConsumableEffect | null;
}

/** « +3 », « −2 » : signe typographique, jamais le tiret court. */
export function signedCoins(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

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
  /** Gagnant(s) : les deux coéquipiers. */
  winners = input.required<ReadonlyArray<VictoryPlayer>>();
  /** Perdant(s) : les deux coéquipiers adverses. */
  losers = input<ReadonlyArray<VictoryPlayer>>([]);
  isWinner = input.required<boolean>();
  byDefault = input<boolean>(false);
  isGuest = input<boolean>(false);
  pointsDelta = input<number | null>(null);
  newPoints = input<number | null>(null);
  newRanking = input<number | null>(null);
  /** Variation de pièces de boutique, signée (le malus Bounty peut la rendre
   *  négative). null = rien gagné ni perdu, ou joueur non crédité. */
  coinsDelta = input<number | null>(null);
  /** Boosters actifs du joueur sur cette partie (ids catalogue). Les montants
   *  ci-dessus les intègrent déjà ; la liste sert à l'expliquer. */
  boosts = input<readonly string[]>([]);
  /** Origine des pièces avant Double Coins (victoire, Bounty, coups doubles). */
  coinsBase = input<CoinsBase | null>(null);
  /** Perfect Game : points ajoutés au gain, avant Double Points. 0 = rien. */
  perfectBonus = input<number>(0);

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
  readonly allyPenalty = computed(() => this.coinsBase()?.allyPenalty ?? 0);
  readonly pairHomeCoins = computed(() => this.coinsBase()?.pairHome ?? 0);
  readonly pairCaptureCoins = computed(() => this.coinsBase()?.pairCapture ?? 0);

  /**
   * D'où viennent les pièces, avant doublement : seulement quand un booster
   * y a pris part (sinon la pastille dit tout). Le malus Bounty y figure en
   * négatif : il explique un total plus bas, voire une perte.
   */
  readonly breakdown = computed<readonly CoinPart[]>(() => {
    const parts: CoinPart[] = [
      { label: "Victory", amount: this.victoryCoins(), effect: null },
      { label: "Captures", amount: this.captureCoins(), effect: "capture_coins" },
      { label: "Own team", amount: -this.allyPenalty(), effect: "capture_coins" },
      { label: "Homecoming", amount: this.pairHomeCoins(), effect: "pair_home" },
      { label: "Double Strike", amount: this.pairCaptureCoins(), effect: "pair_capture" },
    ].filter((p) => p.amount !== 0) as CoinPart[];
    return parts.some((p) => p.effect !== null) ? parts : [];
  });

  /**
   * Boosters équipés qui n'ont rien rapporté cette partie : on le dit, sinon
   * le joueur cherche en vain leur gain. Une seule ligne pour ceux qui paient
   * en jeu, quel qu'en soit le nombre. Seulement une fois les stats reçues.
   */
  readonly unusedBoosts = computed<readonly { effect: ConsumableEffect; text: string }[]>(() => {
    if (this.pointsDelta() === null) return [];
    const notes: { effect: ConsumableEffect; text: string }[] = [];
    const idle: { effect: ConsumableEffect; name: string }[] = [];
    if (hasBoost(this.boosts(), "capture_coins") && this.captureCoins() === 0 && this.allyPenalty() === 0) {
      idle.push({ effect: "capture_coins", name: "Bounty" });
    }
    if (hasBoost(this.boosts(), "pair_home") && this.pairHomeCoins() === 0) {
      idle.push({ effect: "pair_home", name: "Homecoming" });
    }
    if (hasBoost(this.boosts(), "pair_capture") && this.pairCaptureCoins() === 0) {
      idle.push({ effect: "pair_capture", name: "Double Strike" });
    }
    if (hasBoost(this.boosts(), "perfect_win") && this.perfectBonus() === 0) {
      idle.push({ effect: "perfect_win", name: "Perfect Game" });
    }
    if (idle.length > 0) {
      notes.push({ effect: idle[0]!.effect, text: `No payout this game: ${idle.map((i) => i.name).join(", ")}.` });
    }
    if (this.coinsBoosted() && this.coinsDelta() === null) {
      notes.push({ effect: "double_coins", text: "Double Coins: no coins to double this game." });
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
  /** Le malus Bounty est en train de se retrancher. */
  readonly coinsPenalty = signal(false);

  readonly signedCoins = signedCoins;

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

    // Trois temps : les gains de base volent vers la pastille, le sceau de
    // Double Coins les double, puis le malus Bounty s'en retranche. Le joueur
    // voit ce qu'il a gagné, ce que le booster y a ajouté, ce qu'il a perdu.
    const known = this.coinsBase();
    const multiplier = this.coinsBoosted() ? BOOST_MULTIPLIER : 1;
    const base = known
      ? known.victory + known.captures + (known.pairHome ?? 0) + (known.pairCapture ?? 0)
      : Math.max(1, Math.round(total / multiplier));
    const doubled = base * multiplier;

    if (base <= 0 || this.prefersReducedMotion()) {
      this.settleInstantly(total);
      return;
    }

    this.later(() => {
      // requestIdleCallback : les pièces n'arrivent qu'une fois le navigateur
      // libéré. Le timeout garantit qu'elles finissent par se jouer même sur un
      // appareil qui ne respire jamais.
      const idle = window.requestIdleCallback?.bind(window);
      if (idle) idle(() => this.launchCoins(base, doubled, total), { timeout: IDLE_TIMEOUT_MS });
      else this.launchCoins(base, doubled, total);
    }, SETTLE_MS);
  }

  /** `base` pièces volent vers le compteur, qui passe ensuite à `doubled` puis à `total`. */
  private launchCoins(base: number, doubled: number, total: number): void {
    const root = this.host.nativeElement;
    const stage = root.querySelector('.coin-flights');
    // Le trophée est masqué (display: none) sur les écrans bas : sa boîte est
    // alors vide et les pièces partiraient du coin de l'écran. Repli sur le titre.
    const trophy = root.querySelector('.trophy');
    const source =
      trophy && trophy.getBoundingClientRect().width > 0 ? trophy : root.querySelector('.victory-title');
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
        if (i === count - 1) this.finishCoinFlight(base, doubled, total);
      }, coin.delay + COIN_FLIGHT_MS);
    });
  }

  /** Dernière arrivée : on libère les noeuds animés et on cale la vraie valeur. */
  private finishCoinFlight(base: number, doubled: number, total: number): void {
    this.coinsShown.set(base); // si le plafond a tronqué le vol, le compteur dit vrai
    this.flyingCoins.set([]);
    if (doubled > base) {
      this.stampAndDouble(base, doubled, total);
      return;
    }
    this.applyPenalty(base, total);
  }

  /**
   * Double Coins : le sceau « ×2 » se pose sur la pastille, puis le compteur
   * monte de la base au total doublé, un tintement par incrément.
   */
  private stampAndDouble(base: number, doubled: number, total: number): void {
    this.coinsStamped.set(true);
    this.sound.playUnlock();
    const ticks = this.countTo(base, doubled, STAMP_MS);
    this.later(() => this.sound.playCoinSpend(ticks, DOUBLE_STEP_MS), STAMP_MS);
    this.later(() => this.applyPenalty(doubled, total), STAMP_MS + ticks * DOUBLE_STEP_MS);
  }

  /**
   * Malus Bounty : la pastille passe au rouge le temps que le compteur
   * redescende jusqu'au total réellement appliqué (qui peut être négatif).
   */
  private applyPenalty(from: number, total: number): void {
    if (total >= from) {
      this.coinsShown.set(total);
      this.coinsComplete.set(true);
      return;
    }
    this.coinsPenalty.set(true);
    const ticks = this.countTo(from, total, STAMP_MS);
    this.later(() => {
      this.coinsPenalty.set(false);
      this.coinsComplete.set(true);
    }, STAMP_MS + ticks * DOUBLE_STEP_MS);
  }

  /**
   * Fait passer le compteur de `from` à `to` après `delay`, par incréments
   * réguliers (au plus MAX_COUNT_TICKS), et renvoie le nombre d'incréments.
   */
  private countTo(from: number, to: number, delay: number): number {
    const span = Math.abs(to - from);
    const ticks = Math.min(span, MAX_COUNT_TICKS);
    for (let k = 1; k <= ticks; k++) {
      const value = k === ticks ? to : from + Math.round(((to - from) * k) / ticks);
      this.later(() => this.coinsShown.set(value), delay + k * DOUBLE_STEP_MS);
    }
    return ticks;
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
