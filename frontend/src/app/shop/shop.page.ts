import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import type { ShopItem } from '@mercury/shared';
import { ShopService } from '../services/shop.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../shared/toast.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-shop',
  templateUrl: './shop.page.html',
  styleUrls: ['./shop.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [],
})
export class ShopPage implements OnInit {
  readonly shop = inject(ShopService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private location = inject(Location);

  readonly debug = environment.debug;

  loading = signal(true);
  error = signal('');
  signedIn = signal(false);
  /** Objet en attente de confirmation d'achat. null = pas de modale. */
  pending = signal<ShopItem | null>(null);
  /** Id de l'objet dont l'achat est en cours, pour désactiver le bon bouton. */
  busyId = signal('');

  readonly balance = computed(() => this.shop.coins() ?? 0);

  ngOnInit(): void {
    this.auth.user$.subscribe(user => this.signedIn.set(user !== null));

    this.shop
      .load()
      .catch(() => this.error.set('Could not load the shop.'))
      .finally(() => this.loading.set(false));
  }

  isOwned(itemId: string): boolean {
    return this.shop.isOwned(itemId);
  }

  canAfford(item: ShopItem): boolean {
    return this.balance() >= item.price;
  }

  /** Aperçu affiché à gauche de la ligne. Les dos de cartes auront le leur. */
  previewOf(item: ShopItem): string {
    return item.kind === 'emoji' ? item.emoji : '';
  }

  confirm(item: ShopItem): void {
    if (this.isOwned(item.id) || !this.canAfford(item)) return;
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
    try {
      const outcome = await this.shop.purchase(item.id);
      switch (outcome) {
        case 'ok':
          this.toast.show(`${item.label} unlocked.`);
          break;
        case 'insufficient':
          this.toast.show('Not enough coins.', 'error');
          break;
        case 'owned':
          // Déjà acheté ailleurs : l'inventaire vient d'être resynchronisé,
          // la ligne bascule d'elle-même en « Owned ».
          this.toast.show('You already own this item.');
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
}
