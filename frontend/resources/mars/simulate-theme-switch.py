"""Simulation image par image de la bascule jour / nuit, « Le soir tombe » et
l'aube, avec les calques réels de generate-mars-landscape.py et les minutages
de src/styles.scss (à tenir en phase à la main). Sert à voir la bascule sans
lancer l'app : accueil factice sur téléphone, une image toutes les 40 ms.

Usage : python3 simulate-theme-switch.py <dossier de sortie>
Puis, par exemple, pour un GIF :
  ffmpeg -framerate 25 -i <dossier>/dusk/f%03d.png bascule-soir.gif

Fondu de deux images opaques = interpolation linéaire (équivalent du
mix-blend-mode plus-lighter des View Transitions). Les fins liserés entre
bandes du ciel sont un artefact de la simulation, pas de l'app."""
import importlib.util
import os
import re
import subprocess
import sys

GEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generate-mars-landscape.py")
spec = importlib.util.spec_from_file_location("gen", GEN)
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
L = g.layers()
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
W, H = 390, 844
vh = H / 100
hz = H * 0.53
sun_x = W * 0.84
colony_x = W * 0.14
lake_top = hz + 30 * vh


def bake(svg, mode):
    """Couleurs en style inline (Inkscape ne lit pas les variables), ids
    préfixés par mode (jour et nuit coexistent dans une image)."""
    P = g.PALETTES[mode]
    for cls, decl in P["paint"].items():
        svg = svg.replace(f'class="{cls}"', f'style="{decl}"')
    hide = "mars-day-only" if mode == "night" else "mars-night-only"
    svg = re.sub(rf'class="{hide}"', 'display="none"', svg)
    svg = svg.replace(' class="mars-day-only"', "").replace(' class="mars-night-only"', "")
    pre = mode[0] + "-"
    svg = svg.replace('id="mars-', f'id="{pre}mars-').replace("url(#mars-", f"url(#{pre}mars-")
    svg = svg.replace('href="#mars-', f'href="#{pre}mars-')
    return svg


def windows_only(svg, k_alpha):
    """Fenêtres allumées une à une : opacité de chaque halo (groupes 2 à 5)."""
    idx = [0]

    def sub(m):
        a = k_alpha[idx[0]] if idx[0] < len(k_alpha) else 1
        idx[0] += 1
        return m.group(0).replace("<g ", f'<g opacity="{a:.3f}" ', 1)
    return re.sub(r'<g style="fill: var\(--m-[a-z]+\)">', sub, svg)


def clamp(x):
    return max(0.0, min(1.0, x))


def ease_io(p):
    return p * p * (3 - 2 * p)


def ease_in(p):
    return p ** 2.4


def ease_out(p):
    return 1 - (1 - p) ** 3


def fade(t, delay, dur):
    return ease_io(clamp((t - delay) / dur))


LAND = [("far", 0, hz - 9 * vh, W, 10 * vh, None),
        ("mist_far", -0.15 * W, hz - 4 * vh, 1.3 * W, 5.5 * vh, "mars-mist--far"),
        ("hills", 0, hz - 6 * vh, W, 7 * vh, None),
        ("ground", 0, hz, W, 47 * vh, None),
        ("mist_low", -0.15 * W, hz + 0.3 * vh, 1.3 * W, 4 * vh, "mars-mist--low"),
        ("colony", colony_x - 9 * vh, hz - 4.8 * vh, 15 * vh, 7.5 * vh, None),
        ("lake", sun_x - 8 * vh, lake_top, 16 * vh, 5.03 * vh, None),
        ("mist_lake", -0.15 * W, lake_top - 1 * vh, 1.3 * W, 3 * vh, "mars-mist--lake")]


TWILIGHT = ["#1f2a44", "#263453", "#2e3f62", "#384b71", "#43597f", "#50688e", "#5f789c", "#7089a9", "#8299b4"]


def sky(mode, alphas):
    out, prev = [], 0
    for i, (end, col) in enumerate(g.PALETTES[mode]["sky"]):
        out.append(f'<rect y="{prev * hz:.1f}" width="{W}" height="{(end - prev) * hz + 0.6:.1f}" '
                   f'fill="{col}" fill-opacity="{alphas[i]:.3f}"/>')
        prev = end
    return "".join(out)


def bands(old, new, t, direction):
    """Bande par bande : l'ancienne couleur s'efface (0-45 %), le bleu du
    crépuscule apparaît, la nouvelle couleur le recouvre (50-100 %), 560 ms."""
    out, prev = [], 0
    n = len(TWILIGHT)
    for i in range(n):
        end = g.PALETTES[old]["sky"][i][0]
        delay = (i if direction == "dusk" else n - 1 - i) * 65
        q = clamp((t - delay) / 560)
        a_old = 1 - clamp(q / 0.45)
        a_new = clamp((q - 0.5) / 0.5)
        y, h = prev * hz, (end - prev) * hz + 0.6
        for col, a in ((TWILIGHT[i], 1), (g.PALETTES[old]["sky"][i][1], a_old), (g.PALETTES[new]["sky"][i][1], a_new)):
            out.append(f'<rect y="{y:.1f}" width="{W}" height="{h:.1f}" fill="{col}" fill-opacity="{a:.3f}"/>')
        prev = end
    return "".join(out)


def astres(mode, dy, op):
    if op <= 0.001:
        return ""
    top = hz - 26 * vh + dy
    if mode == "day":
        return (g.nest(bake(L["suns"], "day"), sun_x - 23 * vh, top + 10 * vh, 40 * vh, 24 * vh, op)
                + g.nest(bake(L["sunmist"], "day"), sun_x - 12 * vh, top + 19.5 * vh, 24 * vh, 4 * vh, op * 0.9))
    return g.nest(bake(L["moons"], "night"), sun_x - 20 * vh, top, 40 * vh, 24 * vh, op)


def frame(t, direction):
    old, new = ("day", "night") if direction == "dusk" else ("night", "day")
    n = 9
    parts = [bands(old, new, t, direction)]
    # étoiles (calque de nuit)
    stars_a = fade(t, 900, 600) if direction == "dusk" else 1 - fade(t, 0, 400)
    parts.append(f'<g opacity="{stars_a:.3f}">{g.mock_stars(W, hz)}</g>')
    # astres
    if direction == "dusk":
        e_old = ease_in(clamp(t / 650)); e_new = ease_out(clamp((t - 650) / 750))
    else:
        e_old = ease_in(clamp(t / 600)); e_new = ease_out(clamp((t - 600) / 800))
    parts.append(astres(old, 14 * vh * e_old, 1 - e_old))
    parts.append(astres(new, 14 * vh * (1 - e_new), e_new))
    # relief, du lointain au proche
    for k, (name, x, y, w, h, layer) in enumerate(LAND):
        a = fade(t, 420 + k * 60, 440)
        for mode, op in ((old, 1 - a), (new, a)):
            if op <= 0.001:
                continue
            svg = bake(L[name], mode)
            if name == "colony" and mode == "night" and direction == "dusk":
                svg = windows_only(svg, [fade(t, 950 + j * 100, 240) for j in range(4)])
            lo = g.PALETTES[mode]["layers"].get(layer, 1) if layer else 1
            parts.append(g.nest(svg, x, y, w, h, op * lo))
    # interface
    ua = fade(t, 280 if direction == "dusk" else 480, 280)
    parts.append(f'<g opacity="{1 - ua:.3f}">{g.home_ui(W, H, False, old)}</g>')
    parts.append(f'<g opacity="{ua:.3f}">{g.home_ui(W, H, False, new)}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + "".join(parts) + "</svg>")


for direction in ("dusk", "dawn"):
    d = os.path.join(OUT, direction)
    os.makedirs(d, exist_ok=True)
    for i, t in enumerate(range(0, 1601, 40)):
        p = os.path.join(d, f"f{i:03d}.svg")
        open(p, "w").write(frame(t, direction))
        subprocess.run(["inkscape", p, "--export-type=png", f"--export-filename={p[:-4]}.png"],
                       check=True, capture_output=True)
        os.remove(p)
    print(direction, "done")
