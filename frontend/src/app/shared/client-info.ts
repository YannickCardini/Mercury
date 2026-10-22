import { Capacitor } from '@capacitor/core';
import type { ClientInfo, DeviceType } from '@mercury/shared';

/** Largeur (px CSS) du petit côté de l'écran à partir de laquelle un appareil tactile est une tablette. */
const TABLET_MIN_SHORT_SIDE = 600;

function detectDevice(): DeviceType {
  // Pointeur principal fin (souris, pavé tactile) : ordinateur, même avec un
  // écran tactile secondaire. Mesuré sur l'écran physique, donc insensible au
  // mode « site pour ordinateur » d'un navigateur de tablette.
  if (!window.matchMedia('(pointer: coarse)').matches) return 'desktop';
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return shortSide >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'mobile';
}

/**
 * Plateforme et format d'appareil, déclarés au serveur pour les alertes admin.
 * Jamais bloquant : sans API d'écran, on laisse le serveur deviner via les
 * en-têtes (`undefined`).
 */
export function getClientInfo(): ClientInfo | undefined {
  try {
    return {
      platform: Capacitor.getPlatform() === 'android' ? 'android-app' : 'browser',
      device: detectDevice(),
    };
  } catch {
    return undefined;
  }
}

let deviceFingerprint: string | undefined;

/**
 * Empreinte de l'appareil, pour reconnaître dans les alertes admin un invité
 * qui revient sans son browser_id (navigation privée, données effacées, appli
 * réinstallée). Rien n'est stocké : le serveur la réduit à une étiquette courte
 * affichée dans l'alerte.
 *
 * Signaux stables de l'appareil seulement : ni version du navigateur (change
 * chaque mois), ni zoom, ni rendu canvas (bruité en navigation privée par
 * Safari et Firefox). Angles morts : deux appareils identiques réglés pareil
 * (même modèle d'iPhone, même langue, même fuseau) partagent la même empreinte,
 * et un navigateur anti-pistage (Brave) peut la changer d'une visite à l'autre.
 */
export function getDeviceFingerprint(): string | undefined {
  if (deviceFingerprint) return deviceFingerprint;
  try {
    const { width, height, colorDepth } = window.screen;
    const { deviceMemory } = navigator as Navigator & { deviceMemory?: number };
    deviceFingerprint = hash64([
      // Trié : sur Android, largeur et hauteur s'échangent avec l'orientation.
      Math.min(width, height), Math.max(width, height), colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.languages.join(','),
      navigator.hardwareConcurrency, deviceMemory, navigator.maxTouchPoints,
      webglRenderer(),
    ].join('|'));
    return deviceFingerprint;
  } catch {
    return undefined;
  }
}

/** Modèle de GPU vu par WebGL : le signal qui distingue le mieux deux téléphones Android. */
function webglRenderer(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return '';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    // Contexte libéré tout de suite : la WebView Android en limite le nombre.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return renderer;
  } catch {
    return '';
  }
}

/** Hachage non cryptographique (cyrb53 étendu à 64 bits) : le serveur re-hache avec sa clé. */
function hash64(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
