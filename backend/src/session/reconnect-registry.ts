import type { MarbleColor } from '@mercury/shared';

// ─────────────────────────────────────────────────────────────────────────────
// ReconnectRegistry — qui appartient à quelle partie en cours
//
// Deux index sur les mêmes slots :
//  • byGuest — chemin localStorage utilisé par TOUS les clients (invité ou
//    signed-in) : guestPlayerId → { gameId, color }. C'est ce que résout le
//    message WS `joinGame`.
//  • byUser  — chemin serveur-autoritaire, réservé aux joueurs signed-in :
//    userId → { gameId, color, guestPlayerId }. Permet à un client qui a perdu
//    son localStorage (WebView vidée après un arrêt brutal) de récupérer son
//    guestPlayerId depuis son compte, et au serveur de bloquer un compte déjà
//    engagé dans une partie pour qu'il n'en rejoigne pas une seconde.
// ─────────────────────────────────────────────────────────────────────────────

/** Slot d'un joueur dans une partie en cours, adressable pour reconnexion. */
interface GuestIdentity {
    gameId: string;
    color: MarbleColor;
}

/** Entrée d'un joueur signed-in : ajoute le guestPlayerId pour qu'un client à
 *  localStorage vidé puisse réemprunter le chemin `joinGame` existant. */
interface UserActiveGame extends GuestIdentity {
    guestPlayerId: string;
}

export class ReconnectRegistry {

    private byGuest = new Map<string, GuestIdentity>();
    private byUser = new Map<string, UserActiveGame>();

    /** Enregistre un slot joueur. `userId` n'est fourni que pour un signed-in. */
    register(guestPlayerId: string, gameId: string, color: MarbleColor, userId?: string): void {
        this.byGuest.set(guestPlayerId, { gameId, color });
        if (userId) this.byUser.set(userId, { gameId, color, guestPlayerId });
    }

    /** Résout un guestPlayerId vers son slot (chemin WS `joinGame`). */
    getByGuest(guestPlayerId: string): GuestIdentity | undefined {
        return this.byGuest.get(guestPlayerId);
    }

    /** La partie active dont l'utilisateur signed-in est joueur, le cas échéant. */
    getActiveGameForUser(userId: string): UserActiveGame | undefined {
        return this.byUser.get(userId);
    }

    /**
     * Libère un slot unique — abandon d'un invité ou resign d'un signed-in.
     * Retire le slot des deux index pour que le compte soit délivré et puisse
     * rejoindre une nouvelle partie.
     */
    releaseSlot(gameId: string, color: MarbleColor): void {
        for (const [guestId, identity] of this.byGuest) {
            if (identity.gameId === gameId && identity.color === color) {
                this.byGuest.delete(guestId);
                break;
            }
        }
        for (const [userId, entry] of this.byUser) {
            if (entry.gameId === gameId && entry.color === color) {
                this.byUser.delete(userId);
                break;
            }
        }
    }

    /** Libère tous les slots rattachés à une partie terminée/annulée. */
    releaseGame(gameId: string): void {
        for (const [guestId, identity] of this.byGuest) {
            if (identity.gameId === gameId) this.byGuest.delete(guestId);
        }
        for (const [userId, entry] of this.byUser) {
            if (entry.gameId === gameId) this.byUser.delete(userId);
        }
    }
}
