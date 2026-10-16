"""Fond de Mercury : Mars en cours de terraformation, en aplats (flat design en
plans étagés). Un matin clair en mode jour, la même vue de nuit en mode nuit.

Le paysage (crêtes, collines, sol, colonie, lac, brumes) est un seul bloc SVG,
commun aux deux modes : ses couleurs sont des classes `mx-*`, dont les deux
palettes sont écrites dans _mars-palette.scss. Seul le ciel change de bloc :
deux soleils le jour, deux lunes (Phobos et Deimos) la nuit.

Génère aussi des maquettes de composition (téléphone, bureau, jour et nuit)
rendues par Inkscape, pour vérifier la mise en page sans lancer l'app. Aucun
modèle d'image : tout est calculé ici (formes, palettes, positions).

Usage : python3 generate-mars-landscape.py <dossier de sortie>
            [--write-template] [--mock]
  --write-template  réécrit les blocs « mars: » du gabarit du composant et
                    _mars-palette.scss
  --mock            rend les maquettes PNG dans le dossier de sortie

Unité : u = 0,1 vh. Les calques en bande font 3200 u de large et sont
centrés sur l'écran (xMid slice), ce qui garde la même échelle sur tous les
calques et sur tous les écrans : un téléphone voit le centre du panorama,
un écran large en voit davantage.
"""
import math
import os
import random
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(HERE, "../../src/app/shared")
TEMPLATE = os.path.join(SHARED, "space-background.component.html")
PALETTE_SCSS = os.path.join(SHARED, "_mars-palette.scss")


def f(x):
    s = f"{x:.1f}"
    return s[:-2] if s.endswith(".0") else s


# ─── Palettes ───────────────────────────────────────────────────────────────
# sky : bandes nettes du ciel (fin de bande en fraction de la hauteur de
# l'horizon), reprises telles quelles dans --m-sky (tokens.css), puis la
# couleur du sol sous l'horizon. paint : la couleur de chaque classe mx-*.
# layers : opacité de chaque calque de brume.
PALETTES = {
    # Matin clair : perle froide au zénith, abricot sur l'horizon, sable.
    "day": {
        "sky": [
            (0.16, "#c3d2d9"), (0.32, "#c9d6d9"), (0.46, "#d0d9d7"),
            (0.58, "#d8dbd3"), (0.69, "#e0dccf"), (0.79, "#e5d6c5"),
            (0.875, "#e8cebb"), (0.945, "#e9c0a4"), (1.00, "#eabb9b"),
        ],
        "ground": "#eed2b6",
        "paint": {
            # crêtes lointaines : terracotta poudré, voilé par la distance
            "mx-far": "fill: #edcdbb",
            "mx-far-shade": "fill: #e4bfac; fill-opacity: .55",
            "mx-stipple": "fill: #e4bfac",
            "mx-strata": "stroke: #f2d6c6",
            # collines : ocre clair, liseré sur les pentes au soleil
            "mx-hill": "fill: #e8c39f",
            "mx-hill-rim": "stroke: #efd0ae",
            # plaine : quatre bandes de sable
            "mx-g0": "fill: #f3dbc3",
            "mx-g1": "fill: #f0d4b8",
            "mx-g2": "fill: #edceaf",
            "mx-g3": "fill: #eac8a7",
            # brumes : nacre (reflet rosé puis vert pâle), terracotta, ocre
            "mx-nacre-a": "stop-color: #fdf7f1",
            "mx-nacre-b": "stop-color: #fbeeea",
            "mx-nacre-c": "stop-color: #f4f3ec",
            "mx-nacre-bank": "stop-color: #fbf2ec",
            "mx-terra": "stop-color: #f2bea4",
            "mx-ochre": "stop-color: #f9e2b8",
            # lac de cratère
            "mx-lake-rim": "fill: #fff6ea; fill-opacity: .4",
            "mx-lake-bank": "fill: #c4936b; fill-opacity: .3",
            "mx-lichen": "fill: #d3d6aa",
            "mx-water": "fill: #d3e2da",
            "mx-ripple": "stroke: #e6efe9",
            # colonie
            "mx-dome": "fill: #f8f3ec",
            "mx-dome-shade": "fill: #e6dccf",
            "mx-dome-cast": "fill: #c4936b; fill-opacity: .16",
            "mx-mast": "stroke: #e7dccd",
            "mx-colony-base": "stroke: #e3cdb4",
        },
        "layers": {"mars-mist--far": 0.85, "mars-mist--low": 0.55, "mars-mist--lake": 0.75},
    },
    # Nuit noire : bleu nuit presque uniforme, sans lueur ; les mesas, à
    # peine plus claires que le ciel, marquent seules l'horizon. Les plans
    # proches sont plus sombres que les lointains. Lumière froide des lunes,
    # à droite comme les soleils du matin : les ombres ne changent pas de côté.
    "night": {
        "sky": [
            (0.16, "#05080f"), (0.32, "#070a13"), (0.46, "#080c17"),
            (0.58, "#0a0e1a"), (0.69, "#0b101e"), (0.79, "#0d1222"),
            (0.875, "#0f1426"), (0.945, "#11172a"), (1.00, "#131a2e"),
        ],
        "ground": "#1d161a",
        "paint": {
            "mx-far": "fill: #272027",
            "mx-far-shade": "fill: #19141a; fill-opacity: .6",
            "mx-stipple": "fill: #19141a",
            "mx-strata": "stroke: #322a32",
            "mx-hill": "fill: #1f181c",
            "mx-hill-rim": "stroke: #3a2f36",
            "mx-g0": "fill: #22191c",
            "mx-g1": "fill: #1e161a",
            "mx-g2": "fill: #1b1417",
            "mx-g3": "fill: #171114",
            # brumes au clair de lune : argent froid, rose et ocre éteints. La
            # nacre, au pied des mesas, ne dépasse pas leur valeur : aucune
            # lueur ne marque l'horizon.
            "mx-nacre-a": "stop-color: #5a667c",
            "mx-nacre-b": "stop-color: #625f72",
            "mx-nacre-c": "stop-color: #586a6e",
            "mx-nacre-bank": "stop-color: #5a667c",
            "mx-terra": "stop-color: #6e4a52",
            "mx-ochre": "stop-color: #6f6050",
            # le lac reflète le ciel de nuit
            "mx-lake-rim": "fill: #c8d2e6; fill-opacity: .08",
            "mx-lake-bank": "fill: #000; fill-opacity: .3",
            "mx-lichen": "fill: #262a1f",
            "mx-water": "fill: #121c2e",
            "mx-ripple": "stroke: #24324a",
            # dômes dans l'ombre, éclairés de l'intérieur (voir les halos)
            "mx-dome": "fill: #2d2b34",
            "mx-dome-shade": "fill: #1e1c24",
            "mx-dome-cast": "fill: #000; fill-opacity: .3",
            "mx-mast": "stroke: #3a3842",
            "mx-colony-base": "stroke: #2e2529",
        },
        "layers": {"mars-mist--far": 0.12, "mars-mist--low": 0.35, "mars-mist--lake": 0.35},
    },
}


# ─── Crêtes lointaines (3200 × 100, horizon à y = 90) ───────────────────────
FAR_H, FAR_Y0 = 100, 90
MESAS = [  # (centre, largeur au sommet, largeur à la base, hauteur)
    (420, 150, 290, 42), (560, 40, 110, 22), (900, 90, 200, 30),
    (1200, 130, 260, 48), (1318, 34, 96, 24),
    (1445, 64, 150, 40), (1530, 24, 70, 18),   # téléphone : à gauche du trèfle
    (2330, 170, 300, 46), (2475, 36, 100, 22),
    (2660, 80, 170, 32), (3000, 160, 280, 42),
]
LOW_ZONE = (1660, 2120)  # derrière les soleils : crête basse et lisse


def far_base(x):
    h = 9 + 3.2 * math.sin(x / 170 + 0.6)
    lo, hi = LOW_ZONE
    if lo < x < hi:
        k = max(0.0, min(1.0, min(x - lo, hi - x) / 90))
        h = h * (1 - k) + 6.5 * k
    return h


def mesa_h(x, m):
    cx, tw, bw, mh = m
    d = abs(x - cx)
    if d <= tw / 2:
        return mh
    if d >= bw / 2:
        return 0
    return mh * (1 - (d - tw / 2) / (bw / 2 - tw / 2))


def far_profile(x):
    return max([far_base(x)] + [far_base(x) * 0.6 + mesa_h(x, m) for m in MESAS])


def far_svg():
    xs = set(range(0, 3201, 16))
    for cx, tw, bw, mh in MESAS:
        xs.update((cx - bw / 2, cx - tw / 2, cx + tw / 2, cx + bw / 2))
    xs = sorted(x for x in xs if 0 <= x <= 3200)
    sil = f"M0 {FAR_H} " + " ".join(f"L{f(x)} {f(FAR_Y0 - far_profile(x))}" for x in xs) + f" L3200 {FAR_H}Z"

    shades, strata = [], []
    sun_u = sum(LOW_ZONE) / 2  # abscisse moyenne des astres dans le panorama
    for cx, tw, bw, mh in MESAS:
        # Face à l'ombre : le flanc opposé aux astres et un pan du sommet.
        # Dessinée à gauche puis retournée (miroir autour de cx) pour les
        # mesas à droite des astres.
        side = 1 if cx < sun_u else -1
        y_top = FAR_Y0 - far_base(cx) * 0.6 - mh
        xb, xt = cx - side * bw / 2, cx - side * tw / 2
        x_in_top = xt + side * tw * 0.2
        x_in_base = xb + side * ((bw - tw) * 0.5 + tw * 0.08)
        shades.append(
            f"M{f(xb)} {f(FAR_Y0 - far_base(xb) + 0.5)}L{f(xt)} {f(y_top)}L{f(x_in_top)} {f(y_top)}"
            f"L{f(x_in_base)} {FAR_Y0 + 1}L{f(xb)} {FAR_Y0 + 1}Z"
        )
        # strates : deux filets clairs sur la face éclairée
        for frac in (0.34, 0.6):
            ys = y_top + mh * frac
            half = tw / 2 + (bw / 2 - tw / 2) * frac
            inner = x_in_top + (x_in_base - x_in_top) * frac + side * 3
            xa, xb2 = cx - half + 2, cx + half - 2
            if side > 0:
                xa = max(xa, inner)
            else:
                xb2 = min(xb2, inner)
            if xb2 - xa > 8:
                strata.append(f"M{f(xa)} {f(ys)}H{f(xb2)}")
    shade = "".join(shades)
    return (
        f'<svg class="mars-far" viewBox="0 0 3200 {FAR_H}" preserveAspectRatio="xMidYMax slice">'
        '<defs><pattern id="mars-stipple" width="6" height="6" patternUnits="userSpaceOnUse">'
        '<circle class="mx-stipple" cx="1.5" cy="1.5" r=".75" /><circle class="mx-stipple" cx="4.5" cy="4.5" r=".75" />'
        "</pattern></defs>"
        f'<path class="mx-far" d="{sil}" />'
        f'<path class="mx-far-shade" d="{shade}" />'
        f'<path fill="url(#mars-stipple)" d="{shade}" />'
        f'<path class="mx-strata" fill="none" stroke-width="1.6" stroke-linecap="round" d="{"".join(strata)}" />'
        "</svg>"
    )


# ─── Collines (3200 × 70, horizon à y = 60) ─────────────────────────────────
HILL_H, HILL_Y0 = 70, 60
HUMPS = [  # (centre, demi-largeur, hauteur)
    (150, 260, 16), (560, 220, 22), (980, 240, 14), (1290, 170, 20),
    (1560, 150, 12), (2200, 190, 14), (2520, 260, 24), (2900, 220, 15),
    (3150, 200, 18),
]


def hill_h(x):
    h = 2.5
    for cx, hw, hh in HUMPS:
        d = (x - cx) / hw
        if abs(d) < 1:
            h = max(h, hh * (0.5 + 0.5 * math.cos(math.pi * d)))
    lo, hi = LOW_ZONE
    if lo + 40 < x < hi - 40:
        h = min(h, 4)
    return h


def hill_svg():
    step = 12
    sil = f"M0 {HILL_H} " + " ".join(f"L{x} {f(HILL_Y0 - hill_h(x))}" for x in range(0, 3201, step)) + f" L3200 {HILL_H}Z"
    # liseré clair sur les pentes tournées vers les astres (à droite)
    rims, run = [], []
    for x in range(0, 3201 + step, step):
        lit = x <= 3200 and hill_h(x + 3) - hill_h(x - 3) < -0.25 and hill_h(x) > 4
        if lit:
            run.append(x)
        elif run:
            if len(run) > 2:
                rims.append("M" + "L".join(f"{xx} {f(HILL_Y0 - hill_h(xx) + 1.2)}" for xx in run))
            run = []
    return (
        f'<svg class="mars-hills" viewBox="0 0 3200 {HILL_H}" preserveAspectRatio="xMidYMax slice">'
        f'<path class="mx-hill" d="{sil}" />'
        f'<path class="mx-hill-rim" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="{"".join(rims)}" />'
        "</svg>"
    )


# ─── Sol (3200 × 470, horizon à y = 0) ──────────────────────────────────────
GROUND_H = 470
# Le sol n'a plus de cratères (retirés le 2026-10-15 à la demande du
# propriétaire : sur le téléphone ils se lisaient comme des trous noirs, et le
# plus grand passait sous le bouton de version du pied de page). Seul reste le
# lac de cratère, à part.


def ground_svg():
    bands = [(34, "mx-g1"), (110, "mx-g2"), (250, "mx-g3")]
    paths = []
    for i, (y, cls) in enumerate(bands, start=1):
        amp, period = 1.5 + y / 60, 140 + y / 2
        edge = " ".join(f"L{x} {f(y + amp * math.sin(x / period + i * 1.7))}" for x in range(0, 3201, 40))
        paths.append(f'<path class="{cls}" d="M0 {GROUND_H} {edge} L3200 {GROUND_H}Z" />')
    return (
        f'<svg class="mars-ground" viewBox="0 0 3200 {GROUND_H}" preserveAspectRatio="xMidYMin slice">'
        + f'<rect class="mx-g0" width="3200" height="{GROUND_H}" />'
        + "".join(paths) + "</svg>"
    )


# ─── Brumes en bandes (3200 × h) ────────────────────────────────────────────
def fade_grad(gid, cls, peak=None):
    p = f' stop-opacity="{peak}"' if peak else ""
    return (
        f'<linearGradient id="{gid}">'
        f'<stop class="{cls}" offset="0" stop-opacity="0" />'
        f'<stop class="{cls}" offset=".22"{p} />'
        f'<stop class="{cls}" offset=".78"{p} />'
        f'<stop class="{cls}" offset="1" stop-opacity="0" />'
        "</linearGradient>"
    )


def nacre_grad(gid):
    """Blanc nacré : un reflet rosé puis vert pâle le long de la bande."""
    return (
        f'<linearGradient id="{gid}">'
        '<stop class="mx-nacre-a" offset="0" stop-opacity="0" />'
        '<stop class="mx-nacre-a" offset=".2" />'
        '<stop class="mx-nacre-b" offset=".45" />'
        '<stop class="mx-nacre-c" offset=".7" />'
        '<stop class="mx-nacre-c" offset="1" stop-opacity="0" />'
        "</linearGradient>"
    )


def mist_svg(h, banks_, streaks, cls, gid):
    """Bancs larges et pâles, puis filets plus nets ; chaque bande s'efface à
    ses deux bouts. cls None : nacre."""
    grad = nacre_grad(gid) if cls is None else fade_grad(gid, cls)
    bank = fade_grad(gid + "-bank", "mx-nacre-bank" if cls is None else cls, ".5")

    def rects(pills):
        return "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{t}" rx="{f(t / 2)}" />' for x, y, w, t in pills)

    return (
        f'<svg viewBox="0 0 3200 {h}" preserveAspectRatio="xMidYMid slice">'
        f'<defs>{grad}{bank}</defs><g fill="url(#{gid}-bank)">{rects(banks_)}</g><g fill="url(#{gid})">{rects(streaks)}</g></svg>'
    )


def banks(seed, y, length, thick, gap=(130, 260)):
    """Pilules de brume posées l'une après l'autre sur les 3200 u, avec un vrai
    jour entre elles (graine fixe, sortie reproductible). Un téléphone ne voit
    que ~600 u du panorama : il y voit toujours des bouts qui s'effacent,
    jamais une bande continue d'un bord à l'autre."""
    rnd = random.Random(seed)
    out, x = [], -100 + rnd.uniform(0, 200)
    while x < 3300:
        w = rnd.uniform(*length)
        out.append((round(x), round(rnd.uniform(*y), 1), round(w), round(rnd.uniform(*thick), 1)))
        x += w + rnd.uniform(*gap)
    return out


MIST_FAR = (55, banks(11, (18, 30), (260, 460), (14, 22)), banks(12, (20, 46), (120, 300), (3, 7), (70, 180)))
MIST_LOW = (40, banks(21, (4, 16), (260, 480), (14, 20)), banks(22, (4, 28), (140, 320), (4, 9), (90, 200)))
MIST_LAKE = (30, banks(31, (5, 13), (220, 380), (8, 11)), banks(32, (6, 20), (120, 280), (3, 6), (90, 200)))


# ─── Soleils, de jour (400 × 240, horizon à y = 160) ────────────────────────
# Le grand, perle, presque levé ; le petit, or pâle, qui perce à peine : le
# double lever de soleil de Mercure.
def suns_svg():
    bx, by, br = 230, 134, 34
    sx, sy, sr = 172, 141, 16
    out = ['<svg class="mars-suns" viewBox="0 0 400 240">']
    for r, a in [(118, ".07"), (88, ".13"), (64, ".22"), (47, ".38")]:
        out.append(f'<circle cx="{bx}" cy="{by}" r="{r}" fill="#fff6e8" fill-opacity="{a}" />')
    for r, a in [(38, ".14"), (27, ".3")]:
        out.append(f'<circle cx="{sx}" cy="{sy}" r="{r}" fill="#ffe7c4" fill-opacity="{a}" />')
    out.append(f'<circle cx="{bx}" cy="{by}" r="{br}" fill="#fffaf1" />')
    out.append(f'<circle cx="{sx}" cy="{sy}" r="{sr}" fill="#ffdca6" />')
    out.append(f'<circle cx="{sx}" cy="{sy}" r="{f(sr * 0.62)}" fill="#fff0d6" />')
    out.append("</svg>")
    return "".join(out)


def sunmist_svg():
    """Trois filets de nacre en travers des soleils, effacés aux deux bouts."""
    gid = "mars-mist-sun"
    pills = [(30, 12, 160, 4), (84, 22, 150, 3), (12, 29, 116, 2.6)]
    rects = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{t}" rx="{f(t / 2)}" />' for x, y, w, t in pills)
    return f'<svg viewBox="0 0 240 40"><defs>{nacre_grad(gid)}</defs><g fill="url(#{gid})">{rects}</g></svg>'


# ─── Lunes, de nuit (400 × 240, horizon à y = 260) ──────────────────────────
# Phobos et Deimos, les vraies lunes de Mars, là où les soleils se lèvent le
# matin. Phobos, plus grosse et bosselée, porte le cratère Stickney ; Deimos
# n'est qu'un point vif, plus haut à droite (loin du trèfle de l'accueil, dont
# il imiterait une bille). Éclairées par la droite, comme le paysage.
PHOBOS = (200, 120, 25, 21)  # centre, demi-axes
DEIMOS = (250, 50, 4.5)


def phobos_path():
    cx, cy, rx, ry = PHOBOS
    rot = math.radians(-18)
    pts = []
    for i in range(64):
        t = i / 64 * 2 * math.pi
        k = 1 + 0.06 * math.sin(3 * t + 0.5) + 0.035 * math.sin(5 * t + 1.2)
        x, y = rx * k * math.cos(t), ry * k * math.sin(t)
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"


def moons_svg():
    cx, cy, _, _ = PHOBOS
    dx, dy, dr = DEIMOS
    body = phobos_path()
    out = ['<svg class="mars-moons" viewBox="0 0 400 240">']
    out.append(f'<defs><clipPath id="mars-phobos"><path d="{body}" /></clipPath></defs>')
    for r, a in [(78, ".03"), (54, ".05"), (36, ".09")]:
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#c9d6f0" fill-opacity="{a}" />')
    out.append(f'<path d="{body}" fill="#cdc6bb" />')
    out.append(
        '<g clip-path="url(#mars-phobos)">'
        # côté nuit, à gauche
        f'<ellipse cx="{cx - 17}" cy="{cy + 2}" rx="21" ry="28" fill="#8e887f" fill-opacity=".6" />'
        # Stickney, et deux petits cratères
        f'<ellipse cx="{cx - 8}" cy="{cy + 5}" rx="6.5" ry="5.6" fill="#a59e94" />'
        f'<path d="M{cx - 3.2} {cy + 1.2}A6.5 5.6 0 0 1 {cx - 2.6} {cy + 8.4}" fill="none" stroke="#dcd6cc" stroke-width="1.1" />'
        f'<circle cx="{cx + 9}" cy="{cy - 7}" r="2.6" fill="#b8b0a5" />'
        f'<circle cx="{cx + 13}" cy="{cy + 6}" r="1.8" fill="#b8b0a5" />'
        "</g>"
    )
    out.append(
        '<g class="mars-deimos">'
        f'<circle cx="{dx}" cy="{dy}" r="16" fill="#dfe6f5" fill-opacity=".06" />'
        f'<circle cx="{dx}" cy="{dy}" r="10" fill="#dfe6f5" fill-opacity=".12" />'
        f'<circle cx="{dx}" cy="{dy}" r="{dr}" fill="#f1eee8" /></g>'
    )
    out.append("</svg>")
    return "".join(out)


# ─── Lac de cratère (140 × 44) ──────────────────────────────────────────────
# La terraformation : un cratère rempli d'eau, bordé de lichen, qui reflète
# les astres à leur aplomb (les deux soleils le jour, Phobos la nuit).
def lake_svg():
    cx, cy = 70, 22
    return (
        '<svg class="mars-lake" viewBox="0 0 140 44">'
        f'<ellipse class="mx-lake-rim" cx="{cx + 2}" cy="{cy - 1}" rx="68" ry="19.5" />'
        f'<ellipse class="mx-lake-bank" cx="{cx}" cy="{cy}" rx="61" ry="17" />'
        f'<ellipse class="mx-lichen" cx="{cx}" cy="{f(cy + 1.6)}" rx="56" ry="14.2" />'
        f'<ellipse class="mx-water" cx="{cx}" cy="{cy + 2}" rx="53" ry="13" />'
        '<g class="mx-ripple" fill="none" stroke-width=".9">'
        f'<ellipse cx="{cx}" cy="{cy + 2}" rx="40" ry="9.6" />'
        f'<ellipse cx="{cx}" cy="{cy + 2}" rx="25" ry="6" />'
        "</g>"
        # de jour : une colonne de reflets brisés sous chaque soleil (le petit,
        # or pâle, à gauche), de plus en plus courts vers nous
        '<g class="mars-day-only" stroke="#fffaf1" stroke-linecap="round">'
        f'<path stroke-width="1.9" d="M{cx - 8} {cy - 9}H{cx + 8}M{cx - 6} {cy - 4}H{cx + 6}M{cx - 4} {cy + 1}H{cx + 4}M{cx - 2.5} {cy + 6}H{cx + 2.5}" />'
        f'<path stroke-width="1.5" stroke="#ffe9d2" d="M{cx - 49} {cy - 3}H{cx - 41}M{cx - 48} {cy + 2}H{cx - 42}M{cx - 46.5} {cy + 7}H{cx - 43.5}" />'
        "</g>"
        # de nuit : la colonne de Phobos, plus mince et plus pâle
        f'<path class="mars-night-only" stroke="#d9dfea" stroke-opacity=".75" stroke-width="1.5" stroke-linecap="round" '
        f'd="M{cx - 6} {cy - 9}H{cx + 6}M{cx - 4.5} {cy - 4}H{cx + 4.5}M{cx - 3} {cy + 1}H{cx + 3}M{cx - 1.8} {cy + 6}H{cx + 1.8}" />'
        "</svg>"
    )


# ─── Colonie (100 × 50, horizon à y = 40) ───────────────────────────────────
TEAM = {"--m-red": "#c8452f", "--m-blue": "#0477bd", "--m-green": "#00c885", "--m-orange": "#f7914e"}


def colony_svg():
    """Quatre dômes de serre, un par siège : la fenêtre de chacun a la couleur
    d'une équipe du plateau. De jour, deux soleils bas à droite : chaque dôme
    projette deux ombres pâles vers la gauche. De nuit, les fenêtres
    s'allument (deux anneaux de lumière). Le feu du mât (64, 13) n'est pas
    dans le dessin : c'est un élément HTML posé dessus (voir colony_block)."""
    domes = [(38, 9, "--m-red"), (54, 13, "--m-blue"), (72, 10, "--m-green"), (85, 6.5, "--m-orange")]
    base = 42
    out = ['<svg class="mars-colony" viewBox="0 0 100 50">']
    shadows = []
    for cx, r, _ in domes:
        shadows.append(f'<ellipse cx="{f(cx - r * 1.9)}" cy="{f(base + 0.6)}" rx="{f(r * 1.9)}" ry="{f(r * 0.14)}" />')
        shadows.append(f'<ellipse cx="{f(cx - r * 1.4)}" cy="{f(base + 1.5)}" rx="{f(r * 1.5)}" ry="{f(r * 0.12)}" />')
    out.append(f'<g class="mx-dome-cast">{"".join(shadows)}</g>')
    out.append('<path class="mx-mast" d="M64 42V14" stroke-width="1.2" />')
    for cx, r, var in domes:
        out.append(f'<path class="mx-dome" d="M{f(cx - r)} {base}A{r} {r} 0 0 1 {f(cx + r)} {base}Z" />')
        out.append(
            f'<path class="mx-dome-shade" d="M{f(cx - r)} {base}A{r} {r} 0 0 1 {f(cx - r * 0.2)} {f(base - r * 0.98)}'
            f'A{f(r * 0.55)} {r} 0 0 0 {f(cx - r * 0.35)} {base}Z" />'
        )
        wx, wy, wr = f(cx + r * 0.28), f(base - r * 0.32), max(1.1, r * 0.13)
        # de nuit : la lumière de la fenêtre, en anneaux, sur la coque
        out.append(
            f'<g class="mars-night-only" style="fill: var({var})">'
            f'<circle cx="{wx}" cy="{wy}" r="{f(wr * 3.2)}" fill-opacity=".18" />'
            f'<circle cx="{wx}" cy="{wy}" r="{f(wr * 2)}" fill-opacity=".32" /></g>'
        )
        out.append(f'<circle cx="{wx}" cy="{wy}" r="{f(wr)}" style="fill: var({var})" />')
    out.append(f'<path class="mx-colony-base" d="M24 {f(base + 0.5)}H96" stroke-width="1.2" stroke-linecap="round" />')
    out.append("</svg>")
    return "".join(out)


BEACON = (64, 13, 1.4)  # feu du mât, dans le repère 100 × 50 de la colonie


def colony_block(svg, ind="  "):
    """La colonie et son feu de mât, dans un conteneur : le feu est un élément
    HTML pour que son clignotement nocturne tourne sur le GPU, sans réveiller
    le processeur à chaque image."""
    head, body = svg.split(">", 1)
    svg = head.replace(' class="mars-colony"', "") + ">" + body
    return (f'{ind}<div class="mars-colony">\n{fmt(svg, ind + "  ")}\n'
            f'{ind}  <span class="mars-beacon"></span>\n{ind}</div>')


def layers():
    return {
        "suns": suns_svg(),
        "sunmist": sunmist_svg(),
        "moons": moons_svg(),
        "far": far_svg(),
        "mist_far": mist_svg(*MIST_FAR, None, "mars-mist-nacre"),
        "hills": hill_svg(),
        "ground": ground_svg(),
        "mist_low": mist_svg(*MIST_LOW, "mx-terra", "mars-mist-terra"),
        "colony": colony_svg(),
        "lake": lake_svg(),
        "mist_lake": mist_svg(*MIST_LAKE, "mx-ochre", "mars-mist-ochre"),
    }


# ─── Ciel en bandes ─────────────────────────────────────────────────────────
# Les bandes du ciel sont aussi des éléments (pas seulement le dégradé
# --m-sky de l'hôte, qui reste dessous) : à la bascule jour / nuit, chacune
# change de couleur à son tour (voir styles.scss). Mêmes limites dans les deux
# palettes, seules les couleurs changent.
assert [e for e, _ in PALETTES["day"]["sky"]] == [e for e, _ in PALETTES["night"]["sky"]]


def sky_bands():
    out, prev = [], 0
    for i, (end, _) in enumerate(PALETTES["day"]["sky"], 1):
        top = "0" if prev == 0 else f"calc(var(--m-horizon) * {prev:g})"
        out.append(
            f'  <div class="mars-band mars-band-{i}" style="top: {top}; '
            f'height: calc(var(--m-horizon) * {round(end - prev, 4):g})"></div>'
        )
        prev = end
    return "\n".join(out) + "\n"


# ─── Palette SCSS ───────────────────────────────────────────────────────────
def palette_scss():
    def block(sel, mode):
        p = PALETTES[mode]
        lines = [f"{sel} {{"]
        for i, (_, col) in enumerate(p["sky"], 1):
            lines.append(f"  .mars-band-{i} {{ background-color: {col}; }}")
        for cls, decl in p["paint"].items():
            lines.append(f"  .{cls} {{ {decl}; }}")
        for cls, op in p["layers"].items():
            lines.append(f"  .{cls} {{ opacity: {op}; }}")
        lines.append("}")
        return "\n".join(lines)

    return (
        "// Palettes du paysage martien (bandes du ciel, classes mx-* et opacité des\n"
        "// brumes).\n"
        "// Généré par resources/mars/generate-mars-landscape.py --write-template :\n"
        "// modifier le script, pas ce fichier. Nuit par défaut, jour sous .day.\n\n"
        + block(".space-bg", "night") + "\n\n" + block(".space-bg.day", "day") + "\n"
    )


# ─── Gabarit Angular ────────────────────────────────────────────────────────
def fmt(svg, ind="  "):
    """Un élément par ligne, indenté : lisible et comparable d'une version à
    l'autre (les tracés restent sur une ligne)."""
    out, depth = [], 0
    for p in svg.replace("><", ">\n<").split("\n"):
        if p.startswith("</"):
            depth -= 1
        out.append(ind + "  " * depth + p)
        if not p.startswith("</") and not p.endswith("/>") and not re.match(r"<(\w+)[^>]*>.*</\1>$", p):
            depth += 1
    return "\n".join(out)


def mist(cls, svg, ind="  "):
    return f'{ind}<div class="mars-mist mars-mist--{cls}">\n{fmt(svg, ind + "  ")}\n{ind}</div>'


def regions(L):
    return {
        "sky": sky_bands(),
        "day-sky": f'''    <!-- Double lever de soleil : le grand, perle, presque levé ; le petit,
         or pâle, qui perce à peine. Une brume les traverse. -->
{fmt(L["suns"], "    ")}
{mist("sun", L["sunmist"], "    ")}
''',
        "night-sky": f'''    <!-- Phobos et Deimos, là où les soleils se lèvent le matin. -->
{fmt(L["moons"], "    ")}
''',
        "land": f'''  <!-- Mesas lointaines : face à l'ombre pointillée, strates claires sur la
       face éclairée. -->
{fmt(L["far"])}
{mist("far", L["mist_far"])}

  <!-- Collines. -->
{fmt(L["hills"])}

  <!-- Plaine en bandes ondulées, plus foncées vers le premier plan. -->
{fmt(L["ground"])}

  <!-- Brume terracotta sur la plaine, au pied des collines. -->
{mist("low", L["mist_low"])}

  <!-- Colonie, sur la plaine : quatre dômes de serre, la fenêtre de chacun à
       la couleur d'un siège du plateau. -->
{colony_block(L["colony"])}

  <!-- Lac de cratère à l'aplomb des astres, bordé de lichen, et sa brume. -->
{fmt(L["lake"])}
{mist("lake", L["mist_lake"])}
''',
    }


def write_template(L):
    with open(TEMPLATE) as fh:
        s = fh.read()
    for name, body in regions(L).items():
        start_tag, end_tag = f"<!-- mars:{name} -->\n", f"<!-- /mars:{name} -->"
        a = s.index(start_tag) + len(start_tag)
        b = s.rindex("\n", 0, s.index(end_tag)) + 1  # début de la ligne du marqueur de fin
        s = s[:a] + body + s[b:]
    with open(TEMPLATE, "w") as fh:
        fh.write(s)
    with open(PALETTE_SCSS, "w") as fh:
        fh.write(palette_scss())


# ─── Maquettes (Inkscape) ───────────────────────────────────────────────────
def nest(svg, x, y, w, h, opacity=1):
    head, body = svg.split(">", 1)
    attrs = head[len("<svg"):]
    attrs = " ".join(a for a in attrs.split(" ") if not a.startswith("class="))
    for var, hexa in TEAM.items():
        body = body.replace(f'style="fill: var({var})"', f'fill="{hexa}"')
    body = body.replace('href="#', 'xlink:href="#')
    op = f' opacity="{opacity}"' if opacity != 1 else ""
    return f'<g{op}><svg x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" {attrs}>{body}</g>'


def mock_stars(W, hz, seed=7):
    """Étoiles fixes (équivalent des trois couches de box-shadow du composant)."""
    rnd = random.Random(seed)
    out = []
    for count, rmax in ((int(W * hz / 5700), 0.6), (int(W * hz / 20000), 1.0), (int(W * hz / 57000), 1.4)):
        for _ in range(count):
            out.append(f'<circle cx="{f(rnd.uniform(0, W))}" cy="{f(rnd.uniform(0, hz))}" r="{rmax}" '
                       f'fill="#fff" fill-opacity="{rnd.uniform(0.45, 1):.2f}"/>')
    return "".join(out)


def mock(out, L, W, H, landscape, ui, name, mode="day", calm=False):
    """Reproduit les positions de space-background.component.scss (calm :
    astres à moitié effacés, comme dans /game)."""
    P = PALETTES[mode]
    vh = H / 100
    hz = H * (0.64 if landscape else 0.53)
    sun_x = W * (0.74 if landscape else 0.84)
    colony_x = W * (0.22 if landscape else 0.14)
    lake_top = hz + (16 if landscape else 30) * vh
    css = "".join(f".{c}{{{d}}}" for c, d in P["paint"].items())
    css += ".mars-day-only{display:none}" if mode == "night" else ".mars-night-only{display:none}"
    prev, sky = 0, [f"<style>{css}</style>"]
    for end, col in P["sky"]:
        sky.append(f'<rect y="{f(prev * hz)}" width="{W}" height="{f((1 - prev) * hz)}" fill="{col}" shape-rendering="crispEdges"/>')
        prev = end
    sky.append(f'<rect y="{f(hz)}" width="{W}" height="{f(H - hz)}" fill="{P["ground"]}"/>')
    dim = 0.5 if calm else 1
    if mode == "day":
        celestial = [
            nest(L["suns"], sun_x - 23 * vh, hz - 16 * vh, 40 * vh, 24 * vh, dim),
            nest(L["sunmist"], sun_x - 12 * vh, hz - 6.5 * vh, 24 * vh, 4 * vh, 0.5 if calm else 0.9),
        ]
    else:
        # dans /game (calm), les lunes descendent de 13 vh, entre plateau et main
        moons_top = hz - (13 if calm else 26) * vh
        moons = L["moons"].replace('<g class="mars-deimos">', '<g class="mars-deimos" display="none">') if calm else L["moons"]
        celestial = [mock_stars(W, hz), nest(moons, sun_x - 20 * vh, moons_top, 40 * vh, 24 * vh, dim)]
    op = P["layers"]
    parts = sky + celestial + [
        nest(L["far"], 0, hz - 9 * vh, W, 10 * vh),
        nest(L["mist_far"], -0.15 * W, hz - 4 * vh, 1.3 * W, 5.5 * vh, op["mars-mist--far"]),
        nest(L["hills"], 0, hz - 6 * vh, W, 7 * vh),
        nest(L["ground"], 0, hz, W, 47 * vh),
        nest(L["mist_low"], -0.15 * W, hz + 0.3 * vh, 1.3 * W, 4 * vh, op["mars-mist--low"]),
        nest(L["colony"], colony_x - 9 * vh, hz - 4.8 * vh, 15 * vh, 7.5 * vh),
        f'<circle cx="{f(colony_x - 9 * vh + BEACON[0] * 0.15 * vh)}" cy="{f(hz - 4.8 * vh + BEACON[1] * 0.15 * vh)}" '
        f'r="{f(BEACON[2] * 0.15 * vh)}" fill="#f7914e"/>',
        nest(L["lake"], sun_x - 8 * vh, lake_top, 16 * vh, 5.03 * vh),
        nest(L["mist_lake"], -0.15 * W, lake_top - 1 * vh, 1.3 * W, 3 * vh, op["mars-mist--lake"]),
    ]
    if ui:
        parts.append(ui(W, H, landscape, mode))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + "".join(parts) + "</svg>"
    )
    p = os.path.join(out, f"{name}.svg")
    with open(p, "w") as fh:
        fh.write(svg)
    subprocess.run(["inkscape", p, "--export-type=png", f"--export-filename={p[:-4]}.png"],
                   check=True, capture_output=True)


# Couleurs de l'interface, recopiées de tokens.css pour les maquettes seulement.
UI = {
    "day": {"ink": "#133246", "nav": "#fffcf6", "nav_line": "#dccbac", "nav_edge": "#c8b28a",
            "plate": "#fffcf6", "plate_line": "#dccbac", "plate_edge": "#c8b28a", "plate_fg": "#133246",
            "brand": "#133246", "fg": "#133246"},
    "night": {"ink": "#f0f8ff", "nav": "#133246", "nav_line": "#25536b", "nav_edge": "#081a26",
              "plate": "#265670", "plate_line": "#2e637e", "plate_edge": "#0f2938", "plate_fg": "#0c2230",
              "brand": "#f0f8ff", "fg": "#f0f8ff"},
}


def home_ui(W, H, landscape, mode="day"):
    """Accueil factice : barre, titre, trèfle (portrait), trois plaques, pied."""
    c = UI[mode]

    def p(x, y, w, h, r, fill, line, edge, label=None, fg=None):
        s = (f'<rect x="{x}" y="{y + 3}" width="{w}" height="{h}" rx="{r}" fill="{edge}"/>'
             f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{line}"/>')
        if label:
            s += (f'<text x="{x + 52}" y="{y + h / 2 + 6}" font-family="sans-serif" font-weight="700" '
                  f'font-size="19" fill="{fg}">{label}</text>')
        return s

    nav = (c["nav"], c["nav_line"], c["nav_edge"])
    sa_top, sa_bottom = (0, 0) if landscape else (32, 24)
    title = 116 if landscape else 60
    o = [p(20, sa_top + 16, 40, 40, 20, *nav), p(W - 200, sa_top + 16, 80, 40, 20, *nav),
         p(W - 112, sa_top + 16, 92, 40, 20, *nav)]
    nav_bottom, foot_h = sa_top + 72, 64 + sa_bottom
    hero_h = title + 30 + 28 + (0 if landscape else 172) + 202
    top = nav_bottom + (H - foot_h - nav_bottom - hero_h) / 2
    o.append(f'<text x="{W / 2}" y="{top + title * 0.8}" text-anchor="middle" font-family="sans-serif" '
             f'font-weight="800" font-size="{title * 0.9}" fill="{c["brand"]}">MERCURY</text>')
    o.append(f'<text x="{W / 2}" y="{top + title + 22}" text-anchor="middle" font-family="sans-serif" '
             f'font-size="15" fill="{c["fg"]}" fill-opacity="0.8">Toc/Dog/Keezen board game</text>')
    by = top + title + 30 + 28
    if not landscape:
        cy = by + 72
        o.append(f'<circle cx="{W / 2}" cy="{cy}" r="60" fill="none" stroke="{c["fg"]}" stroke-opacity="0.35" stroke-width="2"/>')
        for i, col in enumerate(TEAM.values()):
            a = i * math.pi / 2 + 0.4
            o.append(f'<circle cx="{f(W / 2 + 46 * math.cos(a))}" cy="{f(cy + 46 * math.sin(a))}" r="12" fill="{col}"/>')
        by += 172
    bw = min(340, W - 40)
    bx = (W - bw) / 2
    plate = (c["plate"], c["plate_line"], c["plate_edge"])
    o.append(p(bx, by, bw, 58, 20, "#00c885", "#008f5f", "#008f5f", "Play Now", "#0c2230"))
    o.append(p(bx, by + 72, bw, 58, 20, *plate, "Custom Game", c["plate_fg"]))
    o.append(p(bx, by + 144, bw, 58, 20, *plate, "Leaderboard", c["plate_fg"]))
    fy = H - foot_h + 12
    o.append(f'<text x="24" y="{fy + 22}" font-family="sans-serif" font-size="13" font-weight="700" fill="{c["fg"]}" '
             f'fill-opacity="0.8" text-decoration="underline">How to Play</text>')
    o.append(p(W - 100, fy, 80, 34, 17, *nav))
    return "".join(o)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = args[0] if args else "."
    os.makedirs(out, exist_ok=True)
    L = layers()
    with open(os.path.join(out, "layers.html"), "w") as fh:
        for name, svg in L.items():
            fh.write(f"<!-- {name} -->\n{svg}\n")
    if "--write-template" in sys.argv:
        write_template(L)
    if "--mock" in sys.argv:
        for mode in ("day", "night"):
            mock(out, L, 390, 844, False, home_ui, f"mock-phone-{mode}", mode)
            mock(out, L, 390, 844, False, None, f"bare-phone-{mode}", mode)
            mock(out, L, 1440, 900, True, home_ui, f"mock-desktop-{mode}", mode)
            mock(out, L, 1440, 900, True, None, f"bare-desktop-{mode}", mode)
    print(out)
