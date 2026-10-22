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
//
// Les alertes ajoutent le navigateur (deviné du User-Agent) et une empreinte
// d'appareil (envoyée par les builds récents). Ni l'un ni l'autre n'est stocké.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac } from 'node:crypto';
import type { ClientInfo, ClientPlatform, DeviceType } from '@mercury/shared';

export type PartialClientInfo = Partial<ClientInfo>;

export type BrowserName = 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Opera' | 'Samsung Internet' | 'Facebook' | 'Instagram';
export type OsName = 'Android' | 'iOS' | 'Windows' | 'macOS' | 'Linux' | 'ChromeOS';

export interface BrowserInfo {
    browser?: BrowserName;
    os?: OsName;
}

/** Ce que l'alerte ajoute à PartialClientInfo, jamais stocké. */
export interface ClientExtras {
    browser?: BrowserInfo | undefined;
    /** Étiquette issue de fingerprintTag. */
    fingerprint?: string | undefined;
}

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

/** Premier motif reconnu gagne : les dérivés de Chrome citent aussi « Chrome »,
 *  et Chrome cite aussi « Safari ». Facebook et Instagram : navigateurs
 *  intégrés à ces applis, où la connexion Google est refusée. */
const BROWSERS: readonly (readonly [RegExp, BrowserName])[] = [
    [/FBAN|FBAV/, 'Facebook'],
    [/Instagram/, 'Instagram'],
    [/Edg(e|A|iOS)?\//, 'Edge'],
    [/OPR\/|Opera/, 'Opera'],
    [/SamsungBrowser\//, 'Samsung Internet'],
    [/Firefox\/|FxiOS\//, 'Firefox'],
    [/Chrome\/|CriOS\//, 'Chrome'],
    [/Safari\//, 'Safari'],
];

/** iOS avant macOS (le UA iPhone cite « Mac OS X »), Android avant Linux. */
const SYSTEMS: readonly (readonly [RegExp, OsName])[] = [
    [/iPhone|iPad|iPod/, 'iOS'],
    [/Android/, 'Android'],
    [/CrOS/, 'ChromeOS'],
    [/Windows/, 'Windows'],
    [/Macintosh|Mac OS X/, 'macOS'],
    [/Linux/, 'Linux'],
];

/** Format envoyé par le client : hachage 64 bits en hexadécimal (frontend, shared/client-info.ts). */
const FINGERPRINT_PATTERN = /^[0-9a-f]{16}$/;
const FINGERPRINT_TAG_LENGTH = 6;

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

/** Navigateur et système devinés du User-Agent. Champ inconnu : absent. */
export function detectBrowser(userAgent: unknown): BrowserInfo {
    if (typeof userAgent !== 'string') return {};
    const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
    const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
    return { ...(browser ? { browser } : {}), ...(os ? { os } : {}) };
}

/**
 * Étiquette courte (6 caractères hexadécimaux) de l'empreinte envoyée par le
 * client, ou undefined si absente ou mal formée. Re-hachée avec la clé des
 * sessions : le code client est public, l'étiquette ne doit pas pouvoir être
 * recalculée hors du serveur. Elle change si SESSION_JWT_SECRET change.
 */
export function fingerprintTag(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !FINGERPRINT_PATTERN.test(raw)) return undefined;
    return createHmac('sha256', process.env['SESSION_JWT_SECRET'] ?? '')
        .update(`fingerprint:${raw}`)
        .digest('hex')
        .slice(0, FINGERPRINT_TAG_LENGTH);
}

/** « navigateur Chrome sur Android », ou ce qu'on en sait. */
function browserLabel({ browser, os }: BrowserInfo): string {
    const name = browser ? `${PLATFORM_LABEL.browser} ${browser}` : PLATFORM_LABEL.browser;
    return os ? `${name} sur ${os}` : name;
}

/**
 * Libellé court pour les alertes, ex. « appli Android, mobile » ou
 * « navigateur Safari sur iOS, mobile · empreinte 3fa9c1 ». Jamais d'exception.
 */
export function formatClientLabel(info: PartialClientInfo | undefined, extras: ClientExtras = {}): string {
    // Navigateur précisé hors appli seulement : la WebView de l'appli n'en est pas un.
    const platform = info?.platform === 'browser' && extras.browser
        ? browserLabel(extras.browser)
        : info?.platform ? PLATFORM_LABEL[info.platform] : undefined;
    const device = info?.device ? DEVICE_LABEL[info.device] : undefined;
    const label = !platform && !device ? UNKNOWN_LABEL : `${platform ?? UNKNOWN_LABEL}, ${device ?? UNKNOWN_LABEL}`;
    return extras.fingerprint ? `${label} · empreinte ${extras.fingerprint}` : label;
}

// ── Info par socket ──────────────────────────────────────────────────────────
//
// `req` n'existe qu'à la connexion (index.ts) alors que l'alerte matchmaking se
// construit bien plus loin : on garde l'info par socket plutôt que d'ajouter un
// paramètre à toute la chaîne joinMatchmaking → joinQueue.

interface SocketClient extends ClientExtras {
    info: PartialClientInfo;
}

const socketClients = new WeakMap<object, SocketClient>();

/** À la connexion : ce que disent les en-têtes. */
export function registerSocketClient(ws: object, headers: { origin?: unknown; userAgent?: unknown }): void {
    socketClients.set(ws, { info: detectClientInfo(headers), browser: detectBrowser(headers.userAgent) });
}

/**
 * Au message de setup : la déclaration du client complète les en-têtes.
 * Renvoie plateforme et appareil retenus, seule partie stockée sur le compte.
 */
export function updateSocketClient(ws: object, declared: unknown, rawFingerprint: unknown): PartialClientInfo {
    const current = socketClients.get(ws) ?? { info: {} };
    const info = { ...current.info, ...sanitizeClientInfo(declared) };
    const fingerprint = fingerprintTag(rawFingerprint) ?? current.fingerprint;
    socketClients.set(ws, { ...current, info, fingerprint });
    return info;
}

export function formatSocketClientLabel(ws: object): string {
    const client = socketClients.get(ws);
    return formatClientLabel(client?.info, client);
}
