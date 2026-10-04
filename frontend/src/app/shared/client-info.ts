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
