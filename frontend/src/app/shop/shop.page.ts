import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  isConsumable,
  type ConsumableShopItem,
  type ShopItem,
  type ShopItemKind,
} from '@mercury/shared';
import { ShopService } from '../services/shop.service';
import { AuthService } from '../services/auth.service';
import { BoosterIntentService } from '../services/booster-intent.service';
import { ToastService } from '../shared/toast.service';
import { CoinCountComponent } from '../shared/coin-count.component';
import { BoostCupComponent } from '../shared/boost-cup.component';
import { BoostTokenComponent } from '../shared/boost-token.component';
import { CoinFlightComponent, FLIGHT_COINS } from '../shared/coin-flight.component';
// SoundService vit sous game/ mais est fourni à la racine et ses préférences
// (mute, vibration) sont déjà globales : la boutique le consomme tel quel
// plutôt que de dupliquer une seconde pile audio.
import { SoundService } from '../game/services/sound.service';
import { environment } from 'src/environments/environment';

/** Durée de l'éclosion (anneau + étincelles) sur la tuile achetée. */
const BURST_MS = 900;
/** Le jeton qui se matérialise dans le creux de la carte d'achat s'y pose (écrasement, anneaux). */
const SEAT_MS = 780;

/** Titre de section par famille d'objets. */
const KIND_LABEL: Record<ShopItemKind, string> = {
  consumable: 'Boosters',
  emoji: 'Reactions',
  cardback: 'Card backs',
};

/**
 * Ordre des sections, indépendant de celui du catalogue. Les boosters sont des
 * articles comme les autres : ils s'achètent ici et s'équipent dans le profil.
 */
const KIND_ORDER: readonly ShopItemKind[] = ['emoji', 'consumable', 'cardback'];

/** Ligne d'explication sous le titre, pour les familles qui en ont besoin. */
const KIND_NOTE: Partial<Record<ShopItemKind, string>> = {
  consumable: 'Yours for good once bought. Equip them from your profile: each equipped booster plays in every game.',
};

interface ShopSection {
  readonly kind: ShopItemKind;
  readonly label: string;
  readonly note: string | undefined;
  readonly items: readonly ShopItem[];
}

/** État d'une vignette : un mot par langage visuel. */
type TileState = 'owned' | 'equipped' | 'ready' | 'short';

/**
 * Temps de la carte d'achat d'un booster : la confirmation, le paiement (les
 * pièces volent dans le creux de la carte), puis le booster acquis, qui
 * propose d'aller l'équiper dans le profil.
 */
type BoostPhase = 'confirm' | 'buying' | 'owned';

@Component({
  selector: 'app-shop',
  templateUrl: './shop.page.html',
  styleUrls: ['./shop.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CoinCountComponent, BoostCupComponent, BoostTokenComponent, CoinFlightComponent],
  host: {
    '[class.is-native]': 'isNative',
    '(document:keydown.escape)': 'cancel()',
  },
})
export class ShopPage implements OnInit, OnDestroy {
  readonly shop = inject(ShopService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private sound = inject(SoundService);
  private location = inject(Location);
  private router = inject(Router);
  private intent = inject(BoosterIntentService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private coinFlight = viewChild.required(CoinFlightComponent);

  readonly debug = environment.debug;
  readonly isNative = Capacitor.isNativePlatform();

  loading = signal(true);
  error = signal('');
  signedIn = signal(false);
  /** Objet en attente de confirmation d'achat. null = pas de modale. */
  pending = signal<ShopItem | null>(null);
  /** Id de l'objet dont l'achat est en cours, pour désactiver le bon bouton. */
  busyId = signal('');
  /** Id de la tuile qui éclot. '' = aucune. */
  burstId = signal('');

  /**
   * Id dont l'état « possédé » est retenu jusqu'à l'atterrissage des pièces.
   * Le serveur peut répondre en 150 ms alors que le vol dure près d'une
   * seconde : sans ce verrou, la tuile bascule en « Owned » avant même que le
   * joueur ait vu sa monnaie partir, et l'achat n'a plus de moment à lui.
   */
  private holdOwned = signal('');

  /** Branches de l'étoile d'étincelles ; les angles sont posés en CSS. */
  readonly sparks = [0, 1, 2, 3, 4, 5, 6, 7] as const;

  private timers: ReturnType<typeof setTimeout>[] = [];

  readonly balance = computed(() => this.shop.coins() ?? 0);

  // ── Boosters ───────────────────────────────────────────────────────────────

  /** Temps de la carte d'achat quand elle porte un booster. */
  readonly boostPhase = signal<BoostPhase>('confirm');
  /** Le jeton vient de se matérialiser dans le creux de la carte. */
  readonly seated = signal(false);

  /** Plus un emplacement libre : « Equip » est grisé, il faut d'abord en libérer un. */
  readonly isFull = computed(() => this.shop.equippedBoosts().length >= this.shop.slots());
  /** Les emplacements tels qu'ils sont, pour l'aperçu de la carte acquise. */
  readonly previewSlots = computed<readonly (ConsumableShopItem | null)[]>(() =>
    Array.from({ length: this.shop.slots() }, (_, i) => this.shop.equippedBoosts()[i] ?? null),
  );
  /** Premier emplacement libre (où irait le booster acquis), ou -1. */
  readonly freeSlot = computed(() => {
    const n = this.shop.equippedBoosts().length;
    return n < this.shop.slots() ? n : -1;
  });
  /** Booster de la carte d'achat, ou null (emoji, ou pas de carte). */
  readonly pendingBoost = computed(() => {
    const item = this.pending();
    return item && isConsumable(item) ? item : null;
  });

  /** Articles regroupés par famille (ordre KIND_ORDER), dans l'ordre du catalogue. */
  readonly sections = computed<readonly ShopSection[]>(() => {
    const groups = new Map<ShopItemKind, ShopItem[]>();
    for (const item of this.shop.items()) {
      const bucket = groups.get(item.kind);
      if (bucket) bucket.push(item);
      else groups.set(item.kind, [item]);
    }
    return KIND_ORDER.flatMap(kind => {
      const items = groups.get(kind);
      return items ? [{ kind, label: KIND_LABEL[kind], note: KIND_NOTE[kind], items }] : [];
    });
  });

  /**
   * Article verrouillé le moins cher, boosters compris (achetés une fois, ce
   * sont des objets de collection) : la prochaine marche à franchir.
   */
  readonly nextUnlock = computed<ShopItem | null>(() => {
    const locked = this.shop.items().filter(item => !this.shop.isOwned(item.id));
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

  /** Possédé, hors retenue pendant le vol. */
  isAcquired(item: ShopItem): boolean {
    return this.holdOwned() !== item.id && this.shop.isOwned(item.id);
  }

  canAfford(item: ShopItem): boolean {
    return this.balance() >= item.price;
  }

  /** Aperçu affiché sur la tuile. Les dos de cartes auront le leur. */
  previewOf(item: ShopItem): string {
    return item.kind === 'emoji' ? item.emoji : '';
  }

  /**
   * Classe d'état d'une tuile. Un mot par langage visuel : vert « possédé »
   * (« équipé » pour un booster qui joue déjà), or « à portée », argent
   * éteint « hors budget ».
   */
  stateOf(item: ShopItem): TileState {
    if (this.isAcquired(item)) {
      return isConsumable(item) && this.shop.isEquipped(item.id) ? 'equipped' : 'owned';
    }
    return this.signedIn() && !this.canAfford(item) ? 'short' : 'ready';
  }

  confirm(item: ShopItem): void {
    if (this.isAcquired(item) || !this.canAfford(item) || this.busyId() || this.pending()) return;
    this.boostPhase.set('confirm');
    this.seated.set(false);
    this.pending.set(item);
  }

  /** Ferme la carte, sauf pendant le paiement d'un booster : les pièces sont en vol. */
  cancel(): void {
    if (this.boostPhase() === 'buying') return;
    this.pending.set(null);
  }

  /** Ouvre l'équipement du profil avec ce booster en main. */
  equipInProfile(b: ConsumableShopItem): void {
    this.pending.set(null);
    this.intent.request(b.id);
    void this.router.navigate(['/home']);
  }

  /** Ouvre l'équipement du profil. */
  openLoadout(): void {
    this.intent.requestOpen();
    void this.router.navigate(['/home']);
  }

  async buy(): Promise<void> {
    const item = this.pending();
    if (!item) return;
    if (isConsumable(item)) {
      await this.buyBoost(item);
      return;
    }
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

  /**
   * Paie un booster sans fermer la carte : les pièces partent du solde et
   * tombent dans le creux de la carte, où le jeton, jusque-là en filigrane,
   * se matérialise. La carte devient alors celle du booster acquis, qui
   * propose d'aller l'équiper.
   */
  private async buyBoost(b: ConsumableShopItem): Promise<void> {
    if (this.boostPhase() !== 'confirm') return;
    this.boostPhase.set('buying');
    this.busyId.set(b.id);

    const root = this.host.nativeElement;
    const source = root.querySelector('.sh-vault-coin');
    const target = root.querySelector('.sh-confirm-cup');
    const coinsMs = source && target ? this.coinFlight().launch(source, target) : 0;
    this.sound.playCoinSpend(FLIGHT_COINS);
    this.vibrate(ImpactStyle.Light);

    try {
      const [outcome] = await Promise.all([this.shop.purchase(b.id), this.wait(coinsMs)]);
      if (outcome === 'ok') {
        this.boostPhase.set('owned');
        this.seated.set(true);
        this.later(() => this.seated.set(false), SEAT_MS);
        this.sound.playUnlock();
        this.vibrate(ImpactStyle.Medium);
        return;
      }
      this.boostPhase.set('confirm');
      this.pending.set(null);
      switch (outcome) {
        case 'insufficient':
          this.toast.show('Not enough coins.', 'error');
          break;
        case 'owned':
          this.toast.show(`You already own ${b.label}.`);
          break;
        case 'unauthenticated':
          this.toast.show('Please sign in again.', 'error');
          break;
        default:
          this.toast.show('Purchase failed. Please try again.', 'error');
      }
    } finally {
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
    const root = this.host.nativeElement;
    const source = root.querySelector('.sh-vault-coin');
    const target = root.querySelector(`[data-item="${itemId}"] .sh-tile-orb`);
    if (!source || !target) return 0;
    return this.coinFlight().launch(source, target);
  }

  private celebrate(item: ShopItem): void {
    this.burstId.set(item.id);
    this.sound.playUnlock();
    this.vibrate(ImpactStyle.Medium);
    this.toast.show(`${item.label} unlocked.`);
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
}
