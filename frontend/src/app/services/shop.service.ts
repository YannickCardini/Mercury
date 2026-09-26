import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  getShopItems,
  isEmojiUnlocked,
  type ReactionEmoji,
  type ShopItem,
} from '@mercury/shared';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

interface ShopStateResponse {
  coins: number;
  ownedItems: string[];
  items: ShopItem[];
  /** Id du boost armé pour la prochaine partie, ou null. Absent sur une réponse
   *  d'achat d'objet permanent (n'a pas changé, on garde la valeur connue). */
  pendingBoostId?: string | null;
}

interface ShopErrorBody {
  code?: string;
  coins?: number;
  ownedItems?: string[];
  pendingBoostId?: string | null;
}

export type PurchaseOutcome =
  | 'ok'
  | 'insufficient'
  | 'owned'
  | 'boost_active'
  | 'unauthenticated'
  | 'error';

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
  /** Catalogue embarqué par défaut, remplacé par celui du serveur au chargement. */
  readonly items = signal<readonly ShopItem[]>(getShopItems());
  /** Id du boost consommable armé pour la prochaine partie, ou null. */
  readonly activeBoostId = signal<string | null>(null);

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
    this.apply(state.coins, state.ownedItems);
    this.activeBoostId.set(state.pendingBoostId ?? null);
    if (state.items?.length) this.items.set(state.items);
    this.persist();
  }

  /**
   * Achète un objet. Le prix débité est celui du catalogue serveur : le client
   * n'envoie que l'id. En cas de refus, le corps de la réponse porte le solde
   * réel, donc l'affichage se resynchronise même sur un échec.
   *
   * Pour un boost, la réponse ne porte pas `ownedItems` (un consommable n'y
   * rejoint jamais) mais `pendingBoostId` : `apply` laisse l'inventaire
   * intact dans ce cas, seul `activeBoostId` change.
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
      this.apply(res.coins, res.ownedItems);
      if (res.pendingBoostId !== undefined) this.activeBoostId.set(res.pendingBoostId);
      this.persist();
      return 'ok';
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const body = err.error as ShopErrorBody | undefined;
        if (body?.coins !== undefined) this.apply(body.coins, body.ownedItems);
        if (body?.pendingBoostId !== undefined) this.activeBoostId.set(body.pendingBoostId);
        this.persist();
        if (err.status === 401) return 'unauthenticated';
        if (body?.code === 'ALREADY_OWNED') return 'owned';
        if (body?.code === 'BOOST_ACTIVE') return 'boost_active';
        if (body?.code === 'INSUFFICIENT_FUNDS') return 'insufficient';
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

  /** Vrai si `itemId` est le boost armé pour la prochaine partie. */
  isBoostActive(itemId: string): boolean {
    return this.activeBoostId() === itemId;
  }

  isEmojiUnlocked(emoji: ReactionEmoji): boolean {
    return isEmojiUnlocked(emoji, this.owned());
  }

  /** Le serveur a consommé le boost en fin de partie (message gameStats). */
  clearActiveBoost(): void {
    this.activeBoostId.set(null);
    this.persist();
  }

  clear(): void {
    this.coins.set(null);
    this.owned.set(new Set<string>());
    this.activeBoostId.set(null);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* stockage indisponible (navigation privée) */
    }
  }

  /** `ownedItems` omis (undefined) laisse l'inventaire inchangé (cf. achat d'un boost). */
  private apply(coins: number, ownedItems?: string[]): void {
    this.coins.set(coins);
    if (ownedItems) this.owned.set(new Set(ownedItems));
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
          activeBoostId: this.activeBoostId(),
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
        activeBoostId?: string | null;
      };
      if (typeof cached.coins === 'number') this.coins.set(cached.coins);
      if (Array.isArray(cached.ownedItems)) this.owned.set(new Set(cached.ownedItems));
      if (typeof cached.activeBoostId === 'string') this.activeBoostId.set(cached.activeBoostId);
    } catch {
      /* cache illisible : on repart d'un état vide */
    }
  }
}
