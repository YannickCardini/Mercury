import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  BOOST_SLOT_PRICE,
  FREE_BOOST_SLOTS,
  boostSlotsOf,
  getConsumable,
  getShopItems,
  isConsumable,
  isEmojiUnlocked,
  maxBoostSlots,
  sanitizeLoadout,
  type ConsumableShopItem,
  type ReactionEmoji,
  type ShopItem,
} from '@mercury/shared';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

interface ShopStateResponse {
  coins: number;
  ownedItems: string[];
  /** Absent d'un serveur antérieur aux boosters permanents. */
  equippedBoosts?: string[];
  /** Absent d'un serveur antérieur aux emplacements achetables. */
  boostSlots?: number;
  items: ShopItem[];
}

interface ShopErrorBody {
  code?: string;
  coins?: number;
  ownedItems?: string[];
  equippedBoosts?: string[];
  boostSlots?: number;
}

export type PurchaseOutcome =
  | 'ok'
  | 'insufficient'
  | 'owned'
  | 'unauthenticated'
  | 'error';

export type EquipOutcome = 'ok' | 'unauthenticated' | 'error';

export type SlotOutcome = 'ok' | 'insufficient' | 'max' | 'unauthenticated' | 'error';

const CACHE_KEY = 'shop_state';

/**
 * État de la boutique côté client : solde, inventaire et catalogue.
 *
 * Le cache localStorage n'est pas un confort : la page de jeu peut être ouverte
 * sans passer par la home, et le sélecteur d'emoji doit afficher le bon état de
 * verrouillage immédiatement, sans attendre une réponse HTTP. Le serveur reste
 * seul juge (il revérifie la possession avant de diffuser une réaction).
 */
@Injectable({ providedIn: 'root' })
export class ShopService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  /** null tant que le solde n'est pas connu (invité, ou chargement en cours). */
  readonly coins = signal<number | null>(null);
  readonly owned = signal<ReadonlySet<string>>(new Set<string>());
  /** Ids des boosters équipés, dans l'ordre des emplacements. */
  readonly equipped = signal<readonly string[]>([]);
  /** Emplacements d'équipement du joueur (offerts + achetés). */
  readonly slots = signal(FREE_BOOST_SLOTS);
  /** Catalogue embarqué par défaut, remplacé par celui du serveur au chargement. */
  readonly items = signal<readonly ShopItem[]>(getShopItems());

  readonly slotPrice = BOOST_SLOT_PRICE;
  /** Plafond des emplacements : de quoi équiper tout le catalogue. */
  readonly maxSlots = maxBoostSlots();
  /** Il reste un emplacement à acheter. */
  readonly canBuySlot = computed(() => this.slots() < this.maxSlots);

  /** Tous les boosters du catalogue, dans son ordre. */
  readonly boosts = computed<readonly ConsumableShopItem[]>(() => this.items().filter(isConsumable));

  /** Boosters équipés, dans l'ordre des emplacements : ce qui part avec chaque partie. */
  readonly equippedBoosts = computed<readonly ConsumableShopItem[]>(() =>
    this.equipped().flatMap(id => {
      const item = this.boosts().find(b => b.id === id) ?? getConsumable(id);
      return item ? [item] : [];
    }),
  );

  /** Boosters possédés, dans l'ordre du catalogue. */
  readonly ownedBoosts = computed<readonly ConsumableShopItem[]>(() =>
    this.boosts().filter(item => this.owned().has(item.id)),
  );

  constructor() {
    this.restoreFromCache();
    // Dépendance à sens unique : la boutique connaît l'auth, jamais l'inverse.
    // Une déconnexion doit vider solde et inventaire, sinon le joueur suivant
    // sur le même appareil hériterait des cadenas ouverts du précédent.
    this.auth.user$.subscribe(user => {
      if (!user) this.clear();
    });
  }

  /** Charge catalogue, solde et inventaire. Sans effet pour un invité. */
  async load(): Promise<void> {
    const token = await this.auth.getFreshIdToken();
    if (!token) {
      this.clear();
      return;
    }
    const state = await firstValueFrom(
      this.http.get<ShopStateResponse>(`${environment.apiUrl}/api/shop/state`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    this.apply(state.coins, state.ownedItems, state.equippedBoosts, state.boostSlots);
    if (state.items?.length) this.items.set(state.items);
  }

  /**
   * Achète un objet. Le prix débité est celui du catalogue serveur : le client
   * n'envoie que l'id. En cas de refus, le corps de la réponse porte le solde
   * réel, donc l'affichage se resynchronise même sur un échec.
   */
  async purchase(itemId: string): Promise<PurchaseOutcome> {
    const token = await this.auth.getFreshIdToken();
    if (!token) return 'unauthenticated';
    try {
      const res = await firstValueFrom(
        this.http.post<ShopStateResponse>(
          `${environment.apiUrl}/api/shop/purchase`,
          { itemId },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      this.apply(res.coins, res.ownedItems, res.equippedBoosts, res.boostSlots);
      return 'ok';
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        this.resyncFrom(err);
        const body = err.error as ShopErrorBody | undefined;
        if (err.status === 401) return 'unauthenticated';
        if (body?.code === 'ALREADY_OWNED') return 'owned';
        if (body?.code === 'INSUFFICIENT_FUNDS') return 'insufficient';
      }
      return 'error';
    }
  }

  /**
   * Remplace l'équipement (ids dans l'ordre des emplacements). Appliqué tout
   * de suite à l'écran, puis confirmé par le serveur ; un refus remet l'état
   * qu'il renvoie, ou l'état d'avant si la requête n'a pas abouti.
   */
  async equip(ids: readonly string[]): Promise<EquipOutcome> {
    // Appliqué avant toute attente : l'écran anime l'emplacement dans la même
    // image que l'appel, sans retour fugace à l'état d'avant.
    const previous = this.equipped();
    const next = sanitizeLoadout(ids, this.owned(), this.slots());
    this.equipped.set(next);
    this.persist();
    const token = await this.auth.getFreshIdToken();
    if (!token) {
      this.equipped.set(previous);
      this.persist();
      return 'unauthenticated';
    }
    try {
      const res = await firstValueFrom(
        this.http.post<ShopStateResponse>(
          `${environment.apiUrl}/api/shop/equip`,
          { boosts: next },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      this.apply(res.coins, res.ownedItems, res.equippedBoosts, res.boostSlots);
      return 'ok';
    } catch (err) {
      const http = err instanceof HttpErrorResponse ? err : null;
      if (!http || !this.resyncFrom(http)) {
        this.equipped.set(previous);
        this.persist();
      }
      return http?.status === 401 ? 'unauthenticated' : 'error';
    }
  }

  /** Achète un emplacement d'équipement de plus (prix fixé par le serveur). */
  async buySlot(): Promise<SlotOutcome> {
    const token = await this.auth.getFreshIdToken();
    if (!token) return 'unauthenticated';
    try {
      const res = await firstValueFrom(
        this.http.post<ShopStateResponse>(
          `${environment.apiUrl}/api/shop/slot`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      this.apply(res.coins, res.ownedItems, res.equippedBoosts, res.boostSlots);
      return 'ok';
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        this.resyncFrom(err);
        const body = err.error as ShopErrorBody | undefined;
        if (err.status === 401) return 'unauthenticated';
        if (body?.code === 'INSUFFICIENT_FUNDS') return 'insufficient';
        if (body?.code === 'MAX_SLOTS') return 'max';
      }
      return 'error';
    }
  }

  /** Solde poussé par la fin de partie (message gameStats). */
  setCoins(coins: number): void {
    this.coins.set(coins);
    this.persist();
  }

  /** Debug uniquement (404 hors DEBUG serveur) : crédite le compte pour tester la boutique. */
  async debugAddCoins(): Promise<boolean> {
    const token = await this.auth.getFreshIdToken();
    if (!token) return false;
    try {
      const res = await firstValueFrom(
        this.http.post<{ coins: number }>(
          `${environment.apiUrl}/api/shop/debug-add-coins`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      this.coins.set(res.coins);
      this.auth.patchUser({ coins: res.coins });
      this.persist();
      return true;
    } catch {
      return false;
    }
  }

  isOwned(itemId: string): boolean {
    return this.owned().has(itemId);
  }

  isEquipped(itemId: string): boolean {
    return this.equipped().includes(itemId);
  }

  isEmojiUnlocked(emoji: ReactionEmoji): boolean {
    return isEmojiUnlocked(emoji, this.owned());
  }

  clear(): void {
    this.coins.set(null);
    this.owned.set(new Set<string>());
    this.equipped.set([]);
    this.slots.set(FREE_BOOST_SLOTS);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* stockage indisponible (navigation privée) */
    }
  }

  /**
   * Un refus du serveur porte le porte-monnaie réel : on s'y recale, pour que
   * l'affichage soit juste même après un échec. Vrai si c'était le cas.
   */
  private resyncFrom(err: HttpErrorResponse): boolean {
    const body = err.error as ShopErrorBody | undefined;
    if (body?.coins === undefined) return false;
    this.apply(body.coins, body.ownedItems ?? [...this.owned()], body.equippedBoosts, body.boostSlots);
    return true;
  }

  private apply(
    coins: number,
    ownedItems: string[],
    equippedBoosts: string[] = [],
    boostSlots?: number,
  ): void {
    const slots = boostSlotsOf(boostSlots);
    this.coins.set(coins);
    this.owned.set(new Set(ownedItems));
    this.slots.set(slots);
    this.equipped.set(sanitizeLoadout(equippedBoosts, ownedItems, slots));
    this.auth.patchUser({ coins });
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          coins: this.coins(),
          ownedItems: [...this.owned()],
          equippedBoosts: [...this.equipped()],
          boostSlots: this.slots(),
        }),
      );
    } catch {
      /* stockage indisponible : on retombe sur un chargement réseau */
    }
  }

  private restoreFromCache(): void {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as {
        coins?: number | null;
        ownedItems?: string[];
        equippedBoosts?: string[];
        boostSlots?: number;
      };
      if (typeof cached.coins === 'number') this.coins.set(cached.coins);
      if (Array.isArray(cached.ownedItems)) this.owned.set(new Set(cached.ownedItems));
      this.slots.set(boostSlotsOf(cached.boostSlots));
      if (Array.isArray(cached.equippedBoosts)) {
        this.equipped.set(sanitizeLoadout(cached.equippedBoosts, this.owned(), this.slots()));
      }
    } catch {
      /* cache illisible : on repart d'un état vide */
    }
  }
}
