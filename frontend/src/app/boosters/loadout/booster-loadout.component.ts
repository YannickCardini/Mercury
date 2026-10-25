import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { ConsumableShopItem } from '@mercury/shared';
import { ShopService, type SlotOutcome } from '../../services/shop.service';
import { AppResumeService } from '../../services/app-resume.service';
import { ToastService } from '../../shared/toast.service';
import { CoinCountComponent } from '../../shared/coin-count.component';
import { BoostTokenComponent } from '../../shared/boost-token.component';
import { BoostCupComponent } from '../../shared/boost-cup.component';
import { BoostTipComponent } from '../../shared/boost-tip.component';
import {
  CoinFlightComponent,
  FLIGHT_COINS,
  prefersReducedMotion,
} from '../../shared/coin-flight.component';
import { SoundService } from '../../game/services/sound.service';

/** Vol d'un jeton de sa rangée jusqu'à son creux : le moment fort de l'écran. */
const EQUIP_FLIGHT_MS = 520;
/** Retour d'un jeton retiré vers sa rangée : plus court, une sortie. */
const RELEASE_FLIGHT_MS = 380;
/** Points d'échantillonnage de la trajectoire (voir fly). */
const FLIGHT_SAMPLES = 32;
/** Échos qui suivent le jeton en vol : décalage et opacité de chacun. */
const ECHOES = [
  { delay: 45, opacity: 0.32 },
  { delay: 90, opacity: 0.16 },
] as const;
/** Pose : écrasement du jeton et anneaux du creux (voir boost-cup). */
const SEAT_MS = 780;
/** Anneau gris du creux qui se referme quand on le vide. */
const RELEASE_RING_MS = 380;
/** Glissement des boosters suivants quand un creux se vide (FLIP). */
const SHIFT_MS = 300;
/**
 * Attente avant de poser le booster tenu en main : le temps que la fenêtre du
 * profil finisse de s'ouvrir, pour que le vol se voie en entier.
 */
const HELD_DELAY_MS = 360;

/**
 * Équipement des boosters, dans la fenêtre du profil : un présentoir de creux
 * (un par emplacement, sur plusieurs lignes s'il le faut, puis le prochain à
 * acheter) au-dessus des boosters possédés.
 *
 * Règles du propriétaire : un booster équipé ne se retire que par sa croix
 * (le toucher ouvre son infobulle) ; quand tous les emplacements sont pris,
 * « Equip » est grisé : il faut d'abord en libérer un.
 *
 * `held` : booster arrivé de la vitrine (juste acheté, ou « Equip »). Il est
 * posé dès l'ouverture dans le premier creux libre ; s'il n'y en a plus, sa
 * rangée l'attend, mise en évidence, avec ce qu'il faut faire.
 */
@Component({
  selector: 'app-booster-loadout',
  templateUrl: './booster-loadout.component.html',
  styleUrl: './booster-loadout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CoinCountComponent, BoostTokenComponent, BoostCupComponent, BoostTipComponent, CoinFlightComponent],
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class BoosterLoadoutComponent implements OnInit {
  readonly shop = inject(ShopService);
  readonly appResume = inject(AppResumeService);
  private toast = inject(ToastService);
  private sound = inject(SoundService);
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  private coinFlight = viewChild.required(CoinFlightComponent);
  private flightLayer = viewChild.required<ElementRef<HTMLElement>>('flightLayer');

  /** Booster à poser à l'ouverture (id), ou null. */
  held = input<string | null>(null);

  private readonly isNative = Capacitor.isNativePlatform();

  readonly balance = computed(() => this.shop.coins() ?? 0);

  /** Les emplacements du joueur, dans l'ordre : le booster posé, ou null s'il est libre. */
  readonly slots = computed<readonly (ConsumableShopItem | null)[]>(() =>
    Array.from({ length: this.shop.slots() }, (_, i) => this.shop.equippedBoosts()[i] ?? null),
  );
  readonly equippedCount = computed(() => this.shop.equippedBoosts().length);
  /** Plus un emplacement libre : « Equip » est grisé. */
  readonly isFull = computed(() => this.equippedCount() >= this.shop.slots());
  readonly canAffordSlot = computed(() => this.balance() >= this.shop.slotPrice);
  readonly owned = this.shop.ownedBoosts;

  /** Booster arrivé de la vitrine qui attend une place (présentoir plein). */
  readonly waiting = signal<ConsumableShopItem | null>(null);
  /** L'achat d'un emplacement attend sa confirmation, sous le présentoir. */
  readonly confirmingSlot = signal(false);
  readonly buyingSlot = signal(false);

  /** Emplacement vers lequel un jeton vole : il reste vide jusqu'à l'arrivée. */
  readonly landingSlot = signal(-1);
  /** Emplacement dont le jeton vient de se poser (écrasement, anneaux). */
  readonly seatedSlot = signal(-1);
  /** Emplacement qui vient de se libérer (anneau gris qui se referme). */
  readonly releasedSlot = signal(-1);

  private injector = inject(Injector);
  /** Un retrait est en cours : on n'en lance pas un second par-dessus. */
  private releasing = false;

  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.timers) clearTimeout(timer);
    });
  }

  ngOnInit(): void {
    const id = this.held();
    if (id) this.later(() => this.takeHeld(id), HELD_DELAY_MS);
  }

  // ── Équipement ─────────────────────────────────────────────────────────────

  /** Le booster arrivé de la vitrine : posé s'il reste une place, sinon en attente. */
  private takeHeld(id: string): void {
    const b = this.owned().find(item => item.id === id);
    if (!b || this.shop.isEquipped(b.id)) return;
    if (!this.isFull()) {
      this.equip(b);
      return;
    }
    this.waiting.set(b);
    this.host.nativeElement
      .querySelector(`[data-boost="${b.id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  /** Pose `b` dans le premier creux libre. Sans effet si le présentoir est plein. */
  equip(b: ConsumableShopItem): void {
    if (this.shop.isEquipped(b.id) || this.isFull()) return;
    if (this.waiting()?.id === b.id) this.waiting.set(null);
    const ids = this.shop.equipped();
    void this.place(b, ids.length, [...ids, b.id]);
  }

  /** La croix d'un creux : seul moyen de retirer un booster équipé. */
  remove(i: number): void {
    void this.unequip(i);
  }

  /**
   * Fait voler le jeton de `b` jusqu'à l'emplacement `slot` et enregistre
   * `ids`. Le jeton se pose à la fin du vol, quoi que fasse le réseau : la
   * requête suit à côté et ne se manifeste qu'en cas d'échec (le service remet
   * alors l'état d'avant).
   */
  private async place(b: ConsumableShopItem, slot: number, ids: string[]): Promise<void> {
    this.vibrate(ImpactStyle.Light);
    this.sound.playBoostLaunch(EQUIP_FLIGHT_MS);
    const flight = this.flyToken(b, slot);
    // Posé dans la même image que l'état : le creux garde son jeton caché
    // jusqu'à l'arrivée de celui qui vole.
    if (flight) this.landingSlot.set(slot);
    const saved = this.shop.equip(ids);
    if (flight) await flight;
    this.land(slot);
    const outcome = await saved;
    if (outcome !== 'ok') this.toastEquipFailure(outcome);
  }

  /**
   * Retire le booster du creux `i` : son jeton en sort et retourne à sa
   * rangée, les boosters suivants glissent d'un cran (FLIP) et le creux qui
   * se libère se referme d'un anneau gris. L'état change tout de suite ; le
   * mouvement part de copies, il n'attend rien.
   */
  private async unequip(i: number): Promise<void> {
    const b = this.slots()[i];
    if (!b || this.releasing) return;
    this.releasing = true;
    this.vibrate(ImpactStyle.Light);
    this.sound.playBoostRelease(RELEASE_FLIGHT_MS);

    const motion = !prefersReducedMotion();
    const flight = motion ? this.flyHome(b, i) : null;
    const before = motion ? this.cupRects(i + 1) : new Map<string, DOMRect>();

    const ids = this.shop.equipped().filter((_, j) => j !== i);
    // equip() applique le nouvel état tout de suite ; le glissement des
    // suivants se mesure une fois ce nouvel état peint.
    const done = this.shop.equip(ids);
    this.release(ids.length);
    if (motion) afterNextRender(() => this.slideShifted(before), { injector: this.injector });
    this.releasing = false;

    if (flight) void flight.then(() => this.receive(b));
    const outcome = await done;
    if (outcome !== 'ok') this.toastEquipFailure(outcome);
  }

  private toastEquipFailure(outcome: 'unauthenticated' | 'error'): void {
    this.toast.show(
      outcome === 'unauthenticated'
        ? 'Please sign in again.'
        : 'Could not update your boosters. Please try again.',
      'error',
    );
  }

  // ── Emplacements ───────────────────────────────────────────────────────────

  askSlot(): void {
    if (!this.shop.canBuySlot() || !this.canAffordSlot() || this.buyingSlot()) return;
    this.confirmingSlot.set(true);
  }

  cancelSlot(): void {
    this.confirmingSlot.set(false);
  }

  async buySlot(): Promise<void> {
    if (this.buyingSlot()) return;
    this.confirmingSlot.set(false);
    this.buyingSlot.set(true);
    const coinsMs = this.launchCoins('.lo-cup-btn--locked .lo-cup');
    this.sound.playCoinSpend(FLIGHT_COINS);
    this.vibrate(ImpactStyle.Light);

    let outcome: SlotOutcome = 'error';
    try {
      [outcome] = await Promise.all([this.shop.buySlot(), this.wait(coinsMs)]);
      switch (outcome) {
        case 'ok': {
          this.sound.playUnlock();
          this.vibrate(ImpactStyle.Medium);
          this.toast.show('New slot unlocked.');
          this.land(this.shop.slots() - 1);
          break;
        }
        case 'insufficient':
          this.toast.show('Not enough coins.', 'error');
          break;
        case 'max':
          this.toast.show('Every slot is already unlocked.');
          break;
        case 'unauthenticated':
          this.toast.show('Please sign in again.', 'error');
          break;
        default:
          this.toast.show('Purchase failed. Please try again.', 'error');
      }
    } finally {
      this.buyingSlot.set(false);
    }
  }

  browse(): void {
    void this.router.navigate(['/shop']);
  }

  onEscape(): void {
    if (this.confirmingSlot()) this.cancelSlot();
  }

  // ── Mouvement ──────────────────────────────────────────────────────────────

  /**
   * Équiper : une copie du jeton de la rangée de `b` prend son élan (la rangée
   * le soulève), part en vrille sur un arc, suivie de deux échos, et tombe
   * dans le creux de l'emplacement `slot`. Renvoie la promesse de son
   * arrivée, ou null sans animation (géométrie introuvable, mouvement réduit).
   */
  private flyToken(b: ConsumableShopItem, slot: number): Promise<void> | null {
    if (prefersReducedMotion()) return null;
    const root = this.host.nativeElement;
    const from = root.querySelector<HTMLElement>(`[data-boost="${b.id}"] .lo-row-token`);
    const cup = root.querySelector<HTMLElement>(`[data-slot="${slot}"] .lo-cup`);
    if (!from || !cup) return null;
    // Élan : la rangée soulève son jeton au moment où sa copie s'en détache.
    from.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'translateY(-4px) scale(1.18)', offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      { duration: 300, easing: 'ease-out' },
    );
    return this.fly(from, cup, { duration: EQUIP_FLIGHT_MS, turns: -1, echoes: true, toCup: true });
  }

  /**
   * Retirer : une copie du jeton quitte le creux `slot` et retourne à la
   * rangée de `b`, si elle est visible dans la liste. Sinon (rangée hors de la
   * zone qui défile), null : le creux se vide sur place.
   */
  private flyHome(b: ConsumableShopItem, slot: number): Promise<void> | null {
    const root = this.host.nativeElement;
    const from = root.querySelector<HTMLElement>(`[data-slot="${slot}"] .lo-cup app-boost-token`);
    const to = root.querySelector<HTMLElement>(`[data-boost="${b.id}"] .lo-row-token`);
    const list = root.querySelector<HTMLElement>('.lo-scroll');
    if (!from || !to || !list) return null;
    const r = to.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    if (r.bottom < l.top || r.top > l.bottom) return null;
    return this.fly(from, to, { duration: RELEASE_FLIGHT_MS, turns: 0.5, echoes: false, toCup: false });
  }

  /**
   * Vol d'une copie de `from` jusqu'à `to`, sur le calque de vol.
   *
   * La copie est un clone du DOM du jeton : en encapsulation émulée, ses
   * styles tiennent à ses attributs, il se dessine à l'identique hors de son
   * conteneur. La trajectoire est un arc (courbe de Bézier quadratique)
   * échantillonné en images clés linéaires, l'accélération portée par
   * l'animation entière : un seul geste, sans ralentir à mi-course. La
   * rotation (`turns` tours) et la taille suivent le même échantillonnage.
   * Seul transform est animé, sur des calques promus. Coordonnées relatives au
   * calque : dans la fenêtre du profil, la carte transformée en est le bloc
   * conteneur.
   */
  private fly(
    from: HTMLElement,
    to: HTMLElement,
    opts: { duration: number; turns: number; echoes: boolean; toCup: boolean },
  ): Promise<void> | null {
    const layer = this.flightLayer().nativeElement;
    if (typeof from.animate !== 'function') return null;
    const l = layer.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const c = to.getBoundingClientRect();
    if (a.width === 0 || c.width === 0) return null;

    // Arrivée : centre de la cible, à la taille du jeton qui s'y trouve (deux
    // tiers du creux, voir boost-cup ; la taille du jeton de la rangée sinon).
    const dx = c.left + c.width / 2 - (a.left + a.width / 2);
    const dy = c.top + c.height / 2 - (a.top + a.height / 2);
    const endScale = ((opts.toCup ? c.width * 0.66 : c.width) / a.width);
    // Point de contrôle au-dessus du milieu : l'arc monte, puis descend sur la
    // cible sans jamais la dépasser.
    const cx = dx * 0.5;
    const cy = Math.min(0, dy) * 0.5 - 40;

    const frames: Keyframe[] = [];
    for (let k = 0; k <= FLIGHT_SAMPLES; k++) {
      const t = k / FLIGHT_SAMPLES;
      const u = 1 - t;
      const x = 2 * u * t * cx + t * t * dx;
      const y = 2 * u * t * cy + t * t * dy;
      const s = 1 + (endScale - 1) * t + 0.22 * Math.sin(Math.PI * t);
      const r = opts.turns * 360 * u;
      frames.push({ transform: `translate3d(${x}px, ${y}px, 0) rotate(${r}deg) scale(${s})` });
    }

    const spawn = (opacity: number): HTMLElement => {
      const ghost = from.cloneNode(true) as HTMLElement;
      ghost.classList.remove('is-live', 'is-seated', 'is-landing');
      ghost.classList.add('lo-ghost');
      // En style direct : la copie d'un jeton de creux porte les attributs de
      // style du creux, pas ceux de ce composant, et .lo-ghost ne l'atteint pas.
      ghost.style.position = 'absolute';
      ghost.style.margin = '0';
      ghost.style.pointerEvents = 'none';
      ghost.style.willChange = 'transform';
      ghost.style.left = `${a.left - l.left}px`;
      ghost.style.top = `${a.top - l.top}px`;
      ghost.style.width = `${a.width}px`;
      ghost.style.height = `${a.height}px`;
      // Hors de son creux, la taille du jeton (calculée sur celle du creux)
      // ne se résout plus : on la fixe sur la copie.
      ghost.style.setProperty('--bt-size', `${a.width}px`);
      ghost.style.opacity = String(opacity);
      layer.appendChild(ghost);
      return ghost;
    };
    const timing: KeyframeAnimationOptions = {
      duration: opts.duration,
      easing: 'cubic-bezier(0.45, 0, 0.25, 1)',
      fill: 'forwards',
    };

    // Échos : la même trajectoire, un peu en retard et plus pâle, comme la
    // traîne d'une bille lancée. Ils s'effacent en arrivant.
    if (opts.echoes) {
      for (const echo of ECHOES) {
        const ghost = spawn(echo.opacity);
        const anim = ghost.animate(frames, { ...timing, delay: echo.delay, fill: 'both' });
        ghost.animate([{ opacity: echo.opacity }, { opacity: 0 }], {
          duration: 120,
          delay: echo.delay + opts.duration - 120,
          fill: 'forwards',
        });
        void anim.finished.then(
          () => ghost.remove(),
          () => ghost.remove(),
        );
      }
    }

    const ghost = spawn(1);
    const anim = ghost.animate(frames, timing);
    return anim.finished.then(
      () => this.dropGhost(ghost),
      () => this.dropGhost(ghost),
    );
  }

  /**
   * Retire la copie volante une fois le vrai jeton affiché à sa place : deux
   * images plus tard, le temps que l'état soit peint. Les deux se recouvrent
   * exactement entre-temps, rien ne clignote.
   */
  private dropGhost(ghost: HTMLElement): void {
    requestAnimationFrame(() => requestAnimationFrame(() => ghost.remove()));
  }

  /**
   * Le jeton arrive : le creux le montre, l'écrase puis le pose, et ses deux
   * anneaux partent (voir boost-cup). Le « clac » et la vibration tombent sur
   * l'impact ; le compte d'emplacements saute d'un cran.
   */
  private land(slot: number): void {
    this.landingSlot.set(-1);
    if (slot === -1) return;
    this.sound.playBoostLock();
    this.vibrate(ImpactStyle.Medium);
    this.seatedSlot.set(slot);
    this.later(() => {
      if (this.seatedSlot() === slot) this.seatedSlot.set(-1);
    }, SEAT_MS);
    if (prefersReducedMotion()) return;
    this.host.nativeElement.querySelector<HTMLElement>('.lo-cap-count')?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'ease-out' },
    );
  }

  /** Le creux `slot` vient de se libérer : un anneau gris s'y referme. */
  private release(slot: number): void {
    this.releasedSlot.set(slot);
    this.later(() => {
      if (this.releasedSlot() === slot) this.releasedSlot.set(-1);
    }, RELEASE_RING_MS);
  }

  /** La rangée reçoit le jeton revenu de son creux : un petit rebond. */
  private receive(b: ConsumableShopItem): void {
    this.host.nativeElement
      .querySelector<HTMLElement>(`[data-boost="${b.id}"] .lo-row-token`)
      ?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.35 }, { transform: 'scale(1)' }],
        { duration: 280, easing: 'ease-out' },
      );
  }

  /** Position des jetons des creux à partir de `from`, par booster, avant un retrait. */
  private cupRects(from: number): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    const root = this.host.nativeElement;
    this.slots().forEach((b, j) => {
      if (!b || j < from) return;
      const el = root.querySelector<HTMLElement>(`[data-slot="${j}"] .lo-cup app-boost-token`);
      if (el) rects.set(b.id, el.getBoundingClientRect());
    });
    return rects;
  }

  /**
   * Les boosters qui suivaient le creux vidé ont pris la place d'à côté :
   * chacun glisse depuis son ancienne position (FLIP) au lieu d'y sauter.
   */
  private slideShifted(before: Map<string, DOMRect>): void {
    const root = this.host.nativeElement;
    this.shop.equipped().forEach((id, k) => {
      const old = before.get(id);
      const el = root.querySelector<HTMLElement>(`[data-slot="${k}"] .lo-cup app-boost-token`);
      if (!old || !el) return;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: SHIFT_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    });
  }

  private launchCoins(targetSelector: string): number {
    const root = this.host.nativeElement;
    const source = root.querySelector('.lo-balance-coin');
    const target = root.querySelector(targetSelector);
    if (!source || !target) return 0;
    return this.coinFlight().launch(source, target);
  }

  private vibrate(style: ImpactStyle): void {
    if (!this.isNative || !this.sound.vibrationEnabled()) return;
    void Haptics.impact({ style });
  }

  private wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => this.later(resolve, ms));
  }

  /** setTimeout suivi, pour que fermer la fenêtre n'abandonne pas de minuteur. */
  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers = this.timers.filter(t => t !== timer);
      fn();
    }, ms);
    this.timers.push(timer);
  }
}
