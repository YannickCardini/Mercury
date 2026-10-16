"""Texture « météo » de la Terre vue depuis l'Orbasphère (mode jour).

Produit src/assets/orbasphere/earth-weather.webp : un disque RGBA, nuages
blancs vaporeux et plages sombres des fonds marins, sur fond transparent.
space-background le pose sur l'océan (dessiné en CSS) et le fait tourner
autour du centre de la Terre.

Pré-calculée plutôt que générée dans le navigateur (feTurbulence) : un filtre
SVG serait recalculé à la résolution de l'écran à chaque entrée en mode jour,
une saccade visible sur Android. Ici le téléphone n'a qu'une image à décoder.

Usage (depuis frontend/) :
    python3 resources/orbasphere/generate-earth-weather.py
Déterministe (graine fixe) : relancer redonne la même image.
"""

from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 1600  # côté du disque, en px (téléphone : ~860 px affichés)
SEED = 20261014
OUT = Path(__file__).resolve().parents[2] / "src/assets/orbasphere/earth-weather.webp"

rng = np.random.default_rng(SEED)


def perlin(x: np.ndarray, y: np.ndarray, res: int) -> np.ndarray:
    """Bruit de gradient (Perlin) aux coordonnées (x, y) du domaine [0, 1],
    `res` cellules sur le côté. Valeurs dans [-1, 1] environ."""
    angles = rng.random((res + 3, res + 3)) * 2 * np.pi
    gx, gy = np.cos(angles).astype(np.float32), np.sin(angles).astype(np.float32)
    px = np.clip(x * res, 0, res + 1.999)
    py = np.clip(y * res, 0, res + 1.999)
    xi, yi = np.floor(px).astype(np.int32), np.floor(py).astype(np.int32)
    xf, yf = px - xi, py - yi

    def corner(ox: int, oy: int) -> np.ndarray:
        return gx[yi + oy, xi + ox] * (xf - ox) + gy[yi + oy, xi + ox] * (yf - oy)

    u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    top = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * u
    bottom = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * u
    return (top + (bottom - top) * v) * 1.41


def fbm(x: np.ndarray, y: np.ndarray, res: int, octaves: int, gain: float = 0.5) -> np.ndarray:
    """Somme d'octaves de Perlin (mouvement brownien fractionnaire)."""
    total = np.zeros_like(x)
    amp, norm = 1.0, 0.0
    for k in range(octaves):
        total += amp * perlin(x, y, res * 2**k)
        norm += amp
        amp *= gain
    return total / norm


def smoothstep(e0, e1, v: np.ndarray) -> np.ndarray:
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
u, v = xx / SIZE, yy / SIZE

# Distorsion de domaine lente et ample : elle courbe les masses nuageuses en
# volutes sans les étirer en traînées (gradient faible).
uw = u + 0.07 * fbm(u, v, 2, 4)
vw = v + 0.07 * fbm(u + 0.37, v + 0.71, 2, 4)

# Couverture : alterne zones chargées et ciel dégagé à grande échelle.
coverage = fbm(u, v, 2, 2)

# Bancs (stratocumulus) : bords larges et doux, donc vaporeux.
body = fbm(uw, vw, 4, 7)
deck = smoothstep(0.02 - 0.2 * coverage, 0.42 - 0.2 * coverage, body)
# Grain interne : les bancs ne sont pas des aplats.
grain = fbm(uw, vw, 28, 3)
deck *= 0.74 + 0.26 * smoothstep(-0.5, 0.5, grain)
# Champs de cumulus : petites cellules en bordure des bancs.
cells = fbm(uw, vw, 18, 3)
popcorn = smoothstep(0.08, 0.5, cells) * smoothstep(-0.3, 0.05, body) * (1 - deck) * 0.5

cloud = np.clip(deck * 0.96 + popcorn, 0, 1)

# Fonds marins : plages plus sombres, très douces, sous les nuages.
sea = smoothstep(0.0, 0.5, fbm(u, v, 3, 4)) * 0.38

# Couleurs : nuage blanc, voile bleuté là où il est mince (volume) ; mer
# bleu nuit.
cloud_rgb = np.stack(
    [
        0.80 + 0.20 * cloud,
        0.87 + 0.13 * cloud,
        0.94 + 0.06 * cloud,
    ],
    axis=-1,
)
sea_rgb = np.array([0.02, 0.10, 0.24], np.float32)

alpha = cloud + sea * (1 - cloud)
rgb = (cloud_rgb * cloud[..., None] + sea_rgb * (sea * (1 - cloud))[..., None]) / np.maximum(alpha, 1e-6)[..., None]

# Découpe en disque, bord adouci sur 1,5 px.
r = np.hypot(xx - (SIZE - 1) / 2, yy - (SIZE - 1) / 2)
disc = np.clip((SIZE / 2 - r) / 1.5, 0, 1)
alpha *= disc

rgba = np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])
OUT.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), mode="RGBA").save(
    OUT, "WEBP", quality=72, method=6
)
print(f"{OUT} ({OUT.stat().st_size // 1024} Ko)")
