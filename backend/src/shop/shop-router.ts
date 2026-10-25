// ─────────────────────────────────────────────────────────────────────────────
// backend/src/shop/shop-router.ts
//
// API de la boutique, montée sur /api/shop : l'état (catalogue + porte-monnaie
// + boosters équipés), l'achat, l'équipement des boosters et l'achat d'un
// emplacement d'équipement. Le prix débité
// vient TOUJOURS du catalogue serveur, jamais du corps de la requête.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response } from 'express';
import {
    BOOST_SLOT_PRICE,
    CATALOG_ID_PATTERN,
    getCatalogItem,
    getShopItems,
    maxBoostSlots,
    sanitizeLoadout,
} from '@mercury/shared';
import {
    awardCoins,
    getUserWallet,
    purchaseBoostSlot,
    purchaseItem,
    setEquippedBoosts,
    type UserWallet,
} from '../db.js';
import { verifyAuth } from '../auth/auth-router.js';
import { invalidateOwnedItems } from './entitlements.js';

const router = Router();

/** Crédit accordé par debug-add-coins, pour tester la boutique sans jouer de partie. */
const DEBUG_COINS_AMOUNT = 500;

/**
 * Même sémantique que le DEBUG de game.ts/index.ts : fonction (et non `const`
 * figé à l'import) car dotenv.config() est appelé dans index.ts APRÈS
 * l'évaluation des imports.
 */
function isDebugEnabled(): boolean {
    return process.env['DEBUG'] === 'true';
}

/**
 * Corps commun des réponses : le porte-monnaie vu par le client.
 *
 * `armedBoosts` garde son sens pour les binaires Android d'avant les boosters
 * permanents (« ce qui part avec la prochaine partie ») : ils y lisent
 * l'équipement, et affichent donc « Next game » sur un booster équipé au lieu
 * d'en proposer le rachat. Les clients récents lisent `equippedBoosts`.
 */
function walletBody(wallet: UserWallet | null) {
    const equipped = wallet?.equippedBoosts ?? [];
    const legacy = (wallet?.armedBoosts ?? []).filter(id => !equipped.includes(id));
    return {
        coins: wallet?.coins ?? 0,
        ownedItems: wallet?.ownedItems ?? [],
        armedBoosts: [...equipped, ...legacy],
        equippedBoosts: equipped,
        boostSlots: wallet?.boostSlots ?? 0,
    };
}

/** Même contrat inline que les autres routes protégées du projet. */
async function requireUserId(req: Request, res: Response): Promise<string | null> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
    const userId = await verifyAuth(token);
    if (!userId) {
        res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
        return null;
    }
    return userId;
}

// GET /api/shop/state — catalogue + solde + inventaire du joueur connecté.
// Le catalogue est renvoyé par le serveur (et pas seulement embarqué dans le
// bundle) pour qu'un binaire Android ancien ne puisse pas afficher un prix
// différent de celui qui sera réellement débité.
router.get('/state', async (req: Request, res: Response) => {
    const userId = await requireUserId(req, res);
    if (!userId) return;

    try {
        const wallet = await getUserWallet(userId);
        if (!wallet) {
            res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
            return;
        }
        res.json({ ...walletBody(wallet), items: getShopItems() });
    } catch (err) {
        console.error('❌ Cosmos DB error (GET /shop/state):', err);
        res.status(500).json({ error: 'Database error', code: 'SERVER_ERROR' });
    }
});

// POST /api/shop/purchase — débit et déblocage atomiques.
router.post('/purchase', async (req: Request, res: Response) => {
    const userId = await requireUserId(req, res);
    if (!userId) return;

    const { itemId } = req.body as { itemId?: string };
    // Le motif est aussi ce qui sécurise l'interpolation de l'id dans la
    // condition SQL du patch Cosmos (cf. purchaseItem).
    if (typeof itemId !== 'string' || !CATALOG_ID_PATTERN.test(itemId)) {
        res.status(400).json({ error: 'Unknown item', code: 'UNKNOWN_ITEM' });
        return;
    }
    const item = getCatalogItem(itemId);
    if (!item || item.price <= 0) {
        res.status(400).json({ error: 'Unknown item', code: 'UNKNOWN_ITEM' });
        return;
    }

    try {
        const result = await purchaseItem(userId, item.id, item.price);
        if (result.ok) {
            invalidateOwnedItems(userId);
            // Un booster acheté n'est pas équipé d'office : le client propose
            // de l'équiper depuis le profil, où se règle l'équipement.
            console.log(`🛒 ${userId} a acheté ${item.id} pour ${item.price} (solde ${result.coins})`);
            res.json({ itemId: item.id, ...walletBody(result) });
            return;
        }
        if (result.reason === 'not_found') {
            res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
            return;
        }

        // Refus atomique : on relit pour dire POURQUOI. Hors chemin critique,
        // donc le coût d'une lecture supplémentaire est sans importance ici.
        const wallet = await getUserWallet(userId);
        if (wallet?.ownedItems.includes(item.id)) {
            invalidateOwnedItems(userId);
            res.status(409).json({ error: 'Item already owned', code: 'ALREADY_OWNED', ...walletBody(wallet) });
            return;
        }
        res.status(409).json({ error: 'Not enough coins', code: 'INSUFFICIENT_FUNDS', ...walletBody(wallet) });
    } catch (err) {
        console.error('❌ Cosmos DB error (POST /shop/purchase):', err);
        res.status(500).json({ error: 'Database error', code: 'SERVER_ERROR' });
    }
});

// POST /api/shop/equip — remplace l'équipement : { boosts: string[] }, dans
// l'ordre des emplacements. Refusé en bloc si un id n'est pas un booster
// possédé, est en double, ou dépasse les emplacements du joueur : le client
// applique la même règle (sanitizeLoadout), un refus signale un état périmé.
router.post('/equip', async (req: Request, res: Response) => {
    const userId = await requireUserId(req, res);
    if (!userId) return;

    const { boosts } = req.body as { boosts?: unknown };
    if (
        !Array.isArray(boosts) ||
        boosts.length > maxBoostSlots() ||
        !boosts.every(id => typeof id === 'string' && CATALOG_ID_PATTERN.test(id))
    ) {
        res.status(400).json({ error: 'Invalid loadout', code: 'INVALID_LOADOUT' });
        return;
    }

    try {
        const wallet = await getUserWallet(userId);
        if (!wallet) {
            res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
            return;
        }
        if (boosts.length > wallet.boostSlots) {
            res.status(409).json({ error: 'Not enough slots', code: 'NO_SLOT', ...walletBody(wallet) });
            return;
        }
        const loadout = sanitizeLoadout(boosts as string[], wallet.ownedItems, wallet.boostSlots);
        if (loadout.length !== boosts.length) {
            res.status(409).json({ error: 'Booster not owned', code: 'NOT_OWNED', ...walletBody(wallet) });
            return;
        }
        const updated = await setEquippedBoosts(userId, loadout);
        if (!updated) {
            res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
            return;
        }
        res.json(walletBody(updated));
    } catch (err) {
        console.error('❌ Cosmos DB error (POST /shop/equip):', err);
        res.status(500).json({ error: 'Database error', code: 'SERVER_ERROR' });
    }
});

// POST /api/shop/slot — achète un emplacement d'équipement de plus, au prix
// fixé par le catalogue partagé (BOOST_SLOT_PRICE), jusqu'à maxBoostSlots().
router.post('/slot', async (req: Request, res: Response) => {
    const userId = await requireUserId(req, res);
    if (!userId) return;

    try {
        const result = await purchaseBoostSlot(userId);
        if (result.ok) {
            console.log(`🛒 ${userId} a acheté un emplacement (${result.boostSlots}) pour ${BOOST_SLOT_PRICE} (solde ${result.coins})`);
            res.json(walletBody(result));
            return;
        }
        if (result.reason === 'not_found') {
            res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
            return;
        }
        const wallet = await getUserWallet(userId);
        if (wallet && wallet.boostSlots >= maxBoostSlots()) {
            res.status(409).json({ error: 'All slots unlocked', code: 'MAX_SLOTS', ...walletBody(wallet) });
            return;
        }
        res.status(409).json({ error: 'Not enough coins', code: 'INSUFFICIENT_FUNDS', ...walletBody(wallet) });
    } catch (err) {
        console.error('❌ Cosmos DB error (POST /shop/slot):', err);
        res.status(500).json({ error: 'Database error', code: 'SERVER_ERROR' });
    }
});

// POST /api/shop/debug-add-coins — DEBUG uniquement : crédite le joueur connecté
// pour tester la boutique sans avoir à enchaîner des parties.
router.post('/debug-add-coins', async (req: Request, res: Response) => {
    if (!isDebugEnabled()) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const userId = await requireUserId(req, res);
    if (!userId) return;

    try {
        const coins = await awardCoins(userId, DEBUG_COINS_AMOUNT);
        if (coins === null) {
            res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
            return;
        }
        console.log(`🐛 DEBUG — +${DEBUG_COINS_AMOUNT} pièces pour ${userId} (solde ${coins})`);
        res.json({ coins });
    } catch (err) {
        console.error('❌ Cosmos DB error (POST /shop/debug-add-coins):', err);
        res.status(500).json({ error: 'Database error', code: 'SERVER_ERROR' });
    }
});

export default router;
