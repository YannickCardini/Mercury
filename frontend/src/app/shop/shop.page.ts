import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { ShopItem, ShopItemKind } from '@mercury/shared';
import { ShopService } from '../services/shop.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../shared/toast.service';
import { CoinCountComponent } from '../shared/coin-count.component';
// SoundService vit sous game/ mais est fourni à la racine et ses préférences
// (mute, vibration) sont déjà globales : la boutique le consomme tel quel
// plutôt que de dupliquer une seconde pile audio.
import { SoundService } from '../game/services/sound.service';
import { environment } from 'src/environments/environment';

/** Nombre de pièces envoyées en vol lors d'un achat. */
const FLIGHT_COINS = 6;
/** Durée du vol d'une pièce, hors décalage de départ. */
const COIN_FLIGHT_MS = 620;
/** Écart de départ entre deux pièces successives. */
const COIN_STAGGER_MS = 55;
/** Durée de l'éclosion (anneau + étincelles) sur la tuile achetée. */
const BURST_MS = 900;

/** Titre de section par famille d'objets. */
const KIND_LABEL: Record<ShopItemKind, string> = {
  emoji: 'Reactions',
  cardback: 'Card backs',
  boost: 'Boosts',
};

interface ShopSection {
  readonly kind: ShopItemKind;
  readonly label: string;
  readonly items: readonly ShopItem[];
}

/** Une pièce en vol entre le solde et la tuile achetée. Coordonnées viewport. */
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
  selector: 'app-shop',
  templateUrl: './shop.page.html',
  styleUrls: ['./shop.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CoinCountComponent],
})
export class ShopPage implements OnInit, OnDestroy {
  readonly shop = inject(ShopService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private sound = inject(SoundService);
  private location = inject(Location);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly debug = environment.debug;

  loading = signal(true);
  error = signal('');
  signedIn = signal(false);
  /** Objet en attente de confirmation d'achat. null = pas de modale. */
  pending = signal<ShopItem | null>(null);
  /** Id de l'objet dont l'achat est en cours, pour désactiver le bon bouton. */
  busyId = signal('');
  /** Id de la tuile qui éclot. '' = aucune. */
  burstId = signal('');
  /** Pièces actuellement en vol. */
  flyingCoins = signal<readonly FlyingCoin[]>([]);

  /**
   * Id dont l'état « possédé » est retenu jusqu'à l'atterrissage des pièces.
   * Le serveur peut répondre en 150 ms alors que le vol dure près d'une
   * seconde : sans ce verrou, la tuile bascule en « Owned » avant même que le
   * joueur ait vu sa monnaie partir, et l'achat n'a plus de moment à lui.
   */
  private holdOwned = signal('');

  /** Branches de l'étoile d'étincelles ; les angles sont posés en CSS. */
  readonly sparks = [0, 1, 2, 3, 4, 5, 6, 7] as const;

  private flightSeq = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  readonly balance = computed(() => this.shop.coins() ?? 0);

  /** Articles regroupés par famille, dans l'ordre du catalogue. */
  readonly sections = computed<readonly ShopSection[]>(() => {
    const groups = new Map<ShopItemKind, ShopItem[]>();
    for (const item of this.shop.items()) {
      const bucket = groups.get(item.kind);
      if (bucket) bucket.push(item);
      else groups.set(item.kind, [item]);
    }
    return [...groups].map(([kind, items]) => ({ kind, label: KIND_LABEL[kind], items }));
  });

  /**
   * Article verrouillé le moins cher : la prochaine marche à franchir. Un
   * boost en est exclu : rachetable dès qu'il est consommé, il n'a pas de
   * notion de « collection complète » et resterait indéfiniment le prochain
   * objectif sinon.
   */
  readonly nextUnlock = computed<ShopItem | null>(() => {
    const locked = this.shop.items().filter(item => item.kind !== 'boost' && !this.shop.isOwned(item.id));
    if (locked.length === 0) return null;
    return locked.reduce((cheapest, item) => (item.price < cheapest.price ? item : cheapest));
  });

  /** Plus rien à débloquer. Dérivé de `nextUnlock`, jamais recompté. */
  readonly allOwned = computed(() => this.shop.items().length > 0 && this.nextUnlock() === null);

  /** Pièces manquantes pour `nextUnlock`, ou 0 s'il est déjà à portée. */
  readonly coinsToNext = computed(() => {
    const next = this.nextUnlock();
    return next === null ? 0 : Math.max(0, next.price - this.balance());
  });

  ngOnInit(): void {
    this.auth.user$.subscribe(user => this.signedIn.set(user !== null));

    this.shop
      .load()
      .catch(() => this.error.set('Could not load the shop.'))
      .finally(() => this.loading.set(false));
  }

  ngOnDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  /**
   * « Possédé » couvre deux cas distincts derrière la même tuile figée : un
   * objet permanent débloqué (emoji, dos de carte) ou un boost actuellement
   * armé pour la prochaine partie (rachetable dès qu'il sera consommé).
   */
  isOwned(itemId: string): boolean {
    if (this.holdOwned() === itemId) return false;
    return this.shop.isOwned(itemId) || this.shop.isBoostActive(itemId);
  }

  /** Libellé de la pastille verte : distingue un déblocage définitif d'un boost armé. */
  badgeLabel(item: ShopItem): string {
    return item.kind === 'boost' ? 'Active' : 'Owned';
  }

  /** Libellé de l'action d'achat : « Unlock » pour un objet permanent, « Arm » pour un boost. */
  actionLabel(item: ShopItem): string {
    return item.kind === 'boost' ? 'Arm' : 'Unlock';
  }

  canAfford(item: ShopItem): boolean {
    return this.balance() >= item.price;
  }

  /** Aperçu affiché sur la tuile. Les dos de cartes auront le leur. */
  previewOf(item: ShopItem): string {
    if (item.kind === 'emoji') return item.emoji;
    if (item.kind === 'boost') return `×${item.multiplier}`;
    return '';
  }

  /**
   * Classe d'état d'une tuile. Un seul mot pour trois langages visuels :
   * vert « possédé », or « à portée », argent éteint « hors budget ».
   */
  stateOf(item: ShopItem): 'owned' | 'ready' | 'short' {
    if (this.isOwned(item.id)) return 'owned';
    return this.signedIn() && !this.canAfford(item) ? 'short' : 'ready';
  }

  confirm(item: ShopItem): void {
    if (this.isOwned(item.id) || !this.canAfford(item) || this.busyId()) return;
    this.pending.set(item);
  }

  cancel(): void {
    this.pending.set(null);
  }

  async buy(): Promise<void> {
    const item = this.pending();
    if (!item) return;
    this.pending.set(null);
    this.busyId.set(item.id);
    this.holdOwned.set(item.id);

    // Son et vibration ne dépendent pas du vol : « mouvement réduit » demande
    // de calmer l'image, pas de couper le retour sensoriel. Chacun a déjà son
    // propre réglage (mute, vibration) dans SoundService.
    const flightMs = this.launchCoins(item.id);
    this.sound.playCoinSpend(FLIGHT_COINS);
    this.vibrate(ImpactStyle.Light);

    try {
      // Le vol et la requête avancent de front : la réponse serveur est
      // presque toujours la plus rapide, c'est l'animation qui cadence.
      const [outcome] = await Promise.all([this.shop.purchase(item.id), this.wait(flightMs)]);

      switch (outcome) {
        case 'ok':
          this.celebrate(item);
          break;
        case 'insufficient':
          this.toast.show('Not enough coins.', 'error');
          break;
        case 'owned':
          // Déjà acheté ailleurs : l'inventaire vient d'être resynchronisé,
          // la tuile bascule d'elle-même en « Owned ».
          this.toast.show('You already own this item.');
          break;
        case 'boost_active':
          // Armé ailleurs (autre appareil/onglet) entre l'ouverture de la
          // modale et l'achat : la tuile bascule d'elle-même en « Active ».
          this.toast.show('A boost is already active for your next game.');
          break;
        case 'unauthenticated':
          this.toast.show('Please sign in again.', 'error');
          break;
        default:
          this.toast.show('Purchase failed. Please try again.', 'error');
      }
    } finally {
      this.holdOwned.set('');
      this.busyId.set('');
    }
  }

  goBack(): void {
    this.location.back();
  }

  /** Debug only: credit the account to test purchases without playing games. */
  async debugAddCoins(): Promise<void> {
    const ok = await this.shop.debugAddCoins();
    this.toast.show(ok ? '+500 coins (debug).' : 'Debug credit failed.', ok ? undefined : 'error');
  }

  // ── Animation d'achat ──────────────────────────────────────────────────────

  /**
   * Envoie une poignée de pièces du solde vers la tuile visée et renvoie la
   * durée totale du vol (0 si l'animation n'a pas pu démarrer : géométrie
   * introuvable ou mouvement réduit demandé, auquel cas l'achat se poursuit
   * sans attendre).
   */
  private launchCoins(itemId: string): number {
    if (this.prefersReducedMotion()) return 0;

    const root = this.host.nativeElement;
    const source = root.querySelector('.sh-vault-coin');
    const target = root.querySelector(`[data-item="${itemId}"] .sh-tile-orb`);
    if (!source || !target) return 0;

    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const sx = from.left + from.width / 2;
    const sy = from.top + from.height / 2;
    const tx = to.left + to.width / 2;
    const ty = to.top + to.height / 2;

    const coins: FlyingCoin[] = Array.from({ length: FLIGHT_COINS }, (_, i) => ({
      id: this.flightSeq++,
      x: sx,
      y: sy,
      // Dispersion à l'arrivée et hauteur d'arc variables : six pièces sur la
      // même parabole se liraient comme un seul objet étiré.
      dx: tx - sx + (Math.random() - 0.5) * 26,
      dy: ty - sy + (Math.random() - 0.5) * 18,
      lift: 38 + Math.random() * 46,
      delay: i * COIN_STAGGER_MS,
    }));

    this.flyingCoins.set(coins);
    const total = COIN_FLIGHT_MS + (FLIGHT_COINS - 1) * COIN_STAGGER_MS;
    this.later(() => this.flyingCoins.set([]), total + 80);
    return total;
  }

  private celebrate(item: ShopItem): void {
    this.burstId.set(item.id);
    this.sound.playUnlock();
    this.vibrate(ImpactStyle.Medium);
    const message = item.kind === 'boost' ? `${item.label} armed for your next game.` : `${item.label} unlocked.`;
    this.toast.show(message);
    this.later(() => {
      if (this.burstId() === item.id) this.burstId.set('');
    }, BURST_MS);
  }

  private vibrate(style: ImpactStyle): void {
    if (!Capacitor.isNativePlatform() || !this.sound.vibrationEnabled()) return;
    void Haptics.impact({ style });
  }

  private wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => this.later(resolve, ms));
  }

  /** setTimeout suivi, pour que quitter la page n'abandonne pas de minuteur. */
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
}
