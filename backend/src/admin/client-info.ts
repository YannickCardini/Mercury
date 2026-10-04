// ─────────────────────────────────────────────────────────────────────────────
// Client info : appli Android ou navigateur, mobile / tablette / ordinateur.
//
// Alimente les alertes Telegram et la répartition de GET /api/admin/stats.
// Deux sources, la déclaration du client l'emporte :
//   1. `client` envoyé par les builds récents (mesure réelle de l'appareil) ;
//   2. les en-têtes Origin / User-Agent, valables pour tous les builds déjà
//      installés. Angle mort : un iPad Safari ou une tablette Android en mode
//      « site pour ordinateur » se présentent comme un ordinateur.
//
// Les en-têtes sont écrits par le client : le libellé est assemblé à partir de
// mots fixes, jamais à partir de leur texte, et le User-Agent brut ne sort pas
// de ce module.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClientInfo, ClientPlatform, DeviceType } from '@mercury/shared';

export type PartialClientInfo = Partial<ClientInfo>;

const PLATFORMS: readonly ClientPlatform[] = ['android-app', 'browser'];
const DEVICES: readonly DeviceType[] = ['mobile', 'tablet', 'desktop'];

/** Origine de la WebView Capacitor sur Android (cf. ALLOWED_ORIGINS, index.ts). */
const ANDROID_APP_ORIGIN = 'https://localhost';

const PLATFORM_LABEL: Record<ClientPlatform, string> = {
    'android-app': 'appli Android',
    browser: 'navigateur',
};
const DEVICE_LABEL: Record<DeviceType, string> = {
    mobile: 'mobile',
    tablet: 'tablette',
    desktop: 'ordinateur',
};
const UNKNOWN_LABEL = 'inconnu';

/** Ne garde que les valeurs attendues d'une déclaration client (jamais de texte libre). */
export function sanitizeClientInfo(raw: unknown): PartialClientInfo {
    if (!raw || typeof raw !== 'object') return {};
    const { platform, device } = raw as Record<string, unknown>;
    return {
        ...(PLATFORMS.includes(platform as ClientPlatform) ? { platform: platform as ClientPlatform } : {}),
        ...(DEVICES.includes(device as DeviceType) ? { device: device as DeviceType } : {}),
    };
}

/** Devine plateforme et appareil depuis les en-têtes. Champ inconnu : absent. */
export function detectClientInfo(headers: { origin?: unknown; userAgent?: unknown }): PartialClientInfo {
    const { origin, userAgent } = headers;
    const info: PartialClientInfo = {};

    // Pas d'Origin : client non navigateur, on ne tranche pas.
    if (typeof origin === 'string' && origin.length > 0) {
        info.platform = origin === ANDROID_APP_ORIGIN ? 'android-app' : 'browser';
    }

    if (typeof userAgent === 'string' && userAgent.length > 0) {
        if (/iPad/i.test(userAgent)) info.device = 'tablet';
        else if (/Mobile/i.test(userAgent)) info.device = 'mobile';
        else if (/Android/i.test(userAgent)) info.device = 'tablet';
        else info.device = 'desktop';
    }
    return info;
}

/** Déclaration du client d'abord, en-têtes pour les champs manquants. */
export function resolveClientInfo(declared: unknown, headers: { origin?: unknown; userAgent?: unknown }): PartialClientInfo {
    return { ...detectClientInfo(headers), ...sanitizeClientInfo(declared) };
}

/** Libellé court pour les alertes, ex. « appli Android, mobile ». Jamais d'exception. */
export function formatClientLabel(info: PartialClientInfo | undefined): string {
    const platform = info?.platform ? PLATFORM_LABEL[info.platform] : undefined;
    const device = info?.device ? DEVICE_LABEL[info.device] : undefined;
    if (!platform && !device) return UNKNOWN_LABEL;
    return `${platform ?? UNKNOWN_LABEL}, ${device ?? UNKNOWN_LABEL}`;
}

// ── Info par socket ──────────────────────────────────────────────────────────
//
// `req` n'existe qu'à la connexion (index.ts) alors que l'alerte matchmaking se
// construit bien plus loin : on garde l'info par socket plutôt que d'ajouter un
// paramètre à toute la chaîne joinMatchmaking → joinQueue.

const socketClients = new WeakMap<object, PartialClientInfo>();

export function setSocketClientInfo(ws: object, info: PartialClientInfo): void {
    socketClients.set(ws, info);
}

export function getSocketClientInfo(ws: object): PartialClientInfo | undefined {
    return socketClients.get(ws);
}
