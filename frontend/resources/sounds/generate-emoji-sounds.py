"""Sons des réactions emoji « bruitages » de la boutique : 🎉 Party (cotillon
puis langue de belle-mère), 💥 Boom, 🎺 Sad trombone.

Les autres réactions sont des enregistrements (voix, applaudissements) ; celles
-ci sont des bruits d'objets, que la synthèse rend bien. Tout est calculé ici,
sans échantillon ni modèle : numpy pour le signal, ffmpeg pour la mesure de
sonie et l'encodage mp3. Le tirage est seedé : relancer le script redonne les
mêmes fichiers. Pour retoucher un son, modifier ce script, pas le mp3. Pour le
remplacer par un vrai enregistrement, déposer un fichier du même nom.

Usage : python3 generate-emoji-sounds.py [--wav <dossier>]
  --wav  écrit aussi une copie WAV de chaque son dans le dossier donné

Sortie : src/assets/sounds/emojis/{party,boom,trombone}.mp3, mono 44,1 kHz,
ramenés à TARGET_LUFS (le milieu de la plage des sons existants, qui va de
-10 à -35 LUFS), crête sous -1 dBFS.

Ce qu'entend un téléphone : rien sous ~250 Hz. Les graves (le coup du Boom, le
tube du cotillon de Party) sont donc saturés pour porter des harmoniques, la fondamentale
manquante est reconstituée par l'oreille.
"""
import math
import os
import re
import subprocess
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "../../src/assets/sounds/emojis")

SR = 44100
TARGET_LUFS = -16.0
PEAK_CEILING = 10 ** (-1.0 / 20)  # -1 dBFS


# ── Briques ──────────────────────────────────────────────────────────────────


def times(dur):
    return np.arange(int(round(dur * SR))) / SR


def place(out, sig, at):
    """Ajoute `sig` dans `out` à partir de `at` secondes (tronqué à la fin)."""
    i = int(round(at * SR))
    if i >= len(out):
        return
    n = min(len(sig), len(out) - i)
    out[i:i + n] += sig[:n]


def biquad(x, b0, b1, b2, a0, a1, a2):
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y = [0.0] * len(x)
    x1 = x2 = y1 = y2 = 0.0
    for i, xi in enumerate(x.tolist()):
        yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, xi, y1, yi
        y[i] = yi
    return np.array(y)


def _rbj(f0, q):
    w0 = 2 * math.pi * f0 / SR
    return math.cos(w0), math.sin(w0) / (2 * q)


def bandpass(x, f0, q=1.0):
    c, alpha = _rbj(f0, q)
    return biquad(x, alpha, 0.0, -alpha, 1 + alpha, -2 * c, 1 - alpha)


def highpass(x, f0, q=0.707):
    c, alpha = _rbj(f0, q)
    return biquad(x, (1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha)


def lowpass(x, f0, q=0.707):
    c, alpha = _rbj(f0, q)
    return biquad(x, (1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha)


def sweep_lowpass(x, fc):
    """Passe-bas 12 dB/oct (deux pôles simples) dont la coupure suit `fc`."""
    a = np.exp(-2 * math.pi * np.asarray(fc) / SR).tolist()
    y = [0.0] * len(x)
    s1 = s2 = 0.0
    for i, xi in enumerate(x.tolist()):
        ai = a[i]
        s1 = (1 - ai) * xi + ai * s1
        s2 = (1 - ai) * s1 + ai * s2
        y[i] = s2
    return np.array(y)


def phase_of(freq):
    """Phase cumulée d'une fréquence qui varie dans le temps."""
    return 2 * math.pi * np.cumsum(freq) / SR


def brass(f0, amp, bright):
    """Cuivre en synthèse additive : chaque harmonique de `f0` est pesée par un
    formant (passe-bas résonant centré sur `bright`), puis le tout suit `amp`.
    Les trois paramètres varient dans le temps."""
    phase = phase_of(f0)
    out = np.zeros(len(f0))
    for h in range(1, 40):
        fh = h * f0
        if np.min(fh) > 9000:
            break
        weight = h ** -0.55 / np.sqrt(1 + (fh / bright) ** 4)
        weight += 0.55 * np.exp(-((fh - bright) / (0.28 * bright)) ** 2)
        weight *= fh < 10000
        out += weight * np.sin(h * phase)
    return out * amp


def _comb(x, d, g):
    y = x.copy()
    for i in range(d, len(x), d):
        j = min(i + d, len(x))
        y[i:j] += g * y[i - d:j - d]
    return y


def _allpass(x, d, g):
    y = -g * x
    for i in range(d, len(x), d):
        j = min(i + d, len(x))
        y[i:j] = -g * x[i:j] + x[i - d:j - d] + g * y[i - d:j - d]
    return y


def room(x, size=0.78, wet=0.15, tail=0.5):
    """Petite pièce de Schroeder (4 peignes, 2 passe-tout), mélangée à sec."""
    x = np.concatenate([x, np.zeros(int(tail * SR))])
    combs = [1557, 1617, 1491, 1422]
    w = sum(_comb(x, d, size) for d in combs) / len(combs)
    w = _allpass(_allpass(w, 556, 0.5), 225, 0.5)
    w = lowpass(w, 5200)
    return x + wet * w


def finish(x):
    """Coupe la queue silencieuse, fondu de sortie, retire le continu."""
    x = x - np.mean(x)
    loud = np.nonzero(np.abs(x) > np.max(np.abs(x)) * 10 ** (-58 / 20))[0]
    x = x[: loud[-1] + 1] if len(loud) else x
    fade_in = min(len(x), int(0.002 * SR))
    x[:fade_in] *= np.linspace(0, 1, fade_in)
    fade_out = min(len(x), int(0.04 * SR))
    x[-fade_out:] *= np.linspace(1, 0, fade_out) ** 2
    return x


# ── 🎉 Party : cotillon et confettis, puis langue de belle-mère ─────────────
#
# Choisi à l'oreille par le propriétaire le 2026-11-01 (« pouet, pouuuet »,
# parmi deux coups, un long coup ou un sifflet aigu). Refusés avant lui : un
# claquement sec suivi de tintements électroniques, puis une fanfare de cuivres
# « ta-daaa ».

HORN_AT = 0.3  # le sifflet part quand les confettis volent encore


def soft_pop(rng):
    """Claquement rond de cotillon : la résonance du tube, sans sifflement."""
    t = times(0.08)
    burst = rng.standard_normal(len(t)) * (1 - np.exp(-t / 0.0004)) * np.exp(-t / 0.006)
    pop = bandpass(burst, 950, 1.6) + 0.45 * bandpass(burst, 2300, 1.2)
    body = np.tanh(2.0 * np.sin(phase_of(80 + 90 * np.exp(-t / 0.025)))) * np.exp(-t / 0.025)
    return pop / np.max(np.abs(pop)) + 0.45 * body


def rustle(rng, n, start, span, count):
    """Confettis en papier : grains de bruit vers 4 kHz, de plus en plus rares."""
    paper = np.zeros(n)
    for at in np.sort(start + span * rng.random(count) ** 1.3):
        t = times(rng.uniform(0.003, 0.008))
        grain = rng.standard_normal(len(t)) * np.exp(-t / 0.0018)
        place(paper, (1 - (at - start) / span * 0.8) * rng.uniform(0.4, 1) * grain, at)
    return bandpass(paper, 4200, 0.9)


def blower(rng, total, toots, f, duty, formants, rasp, drop):
    """Langue de belle-mère : anche en papier (onde à impulsions de rapport
    `duty`), filtrée par des formants nasaux. À chaque coup, la note monte à
    l'attaque, monte encore un peu quand le papier se déroule (qui claque au
    début), puis retombe de `drop` cents quand le souffle s'arrête."""
    t = times(total)
    n = len(t)
    f0 = np.full(n, float(f))
    amp = np.zeros(n)
    for at, dur in toots:
        m = (t >= at) & (t < at + dur + 0.1)
        u = t[m] - at
        rise = -200 * np.exp(-u / 0.04)
        extend = 35 * np.clip(u / dur, 0, 1)
        fall = -drop * np.clip((u - dur) / 0.09, 0, 1) ** 1.5
        f0[m] = f * 2 ** ((rise + extend + fall) / 1200)
        a = (1 - np.exp(-u / 0.01)) * np.clip((at + dur + 0.09 - t[m]) / 0.09, 0, 1)
        flap = 1 + 0.45 * np.exp(-u / 0.12) * np.sin(2 * math.pi * 26 * u)
        amp[m] = a * flap

    # Le souffle n'est jamais parfaitement stable : la note erre de ±8 cents.
    wander = lowpass(rng.standard_normal(n), 8)
    f0 = f0 * 2 ** (8 * wander / np.std(wander) / 1200)
    phase = phase_of(f0)
    reed = np.zeros(n)
    for h in range(1, 40):
        fh = h * f0
        if np.min(fh) > 12000:
            break
        reed += (2 / (math.pi * h)) * math.sin(math.pi * h * duty) * np.sin(h * phase) * (fh < 12000)

    # Bourdonnement du papier : l'amplitude tremble de façon irrégulière.
    rough = lowpass(rng.standard_normal(n), 120)
    reed *= amp * (1 + rasp * rough / np.std(rough))
    voiced = sum(gain * bandpass(reed, fc, q) for fc, q, gain in formants)
    voiced = voiced / np.max(np.abs(voiced))
    breath = bandpass(rng.standard_normal(n), 2400, 1.0) * amp
    return voiced / np.max(np.abs(voiced)) + 0.04 * breath


def party(rng):
    horn = dict(total=0.9, toots=[(0.0, 0.13), (0.2, 0.55)], f=590, duty=0.35,
                formants=[(1250, 2.2, 1.0), (2700, 2.5, 0.8), (650, 1.5, 0.25)], rasp=0.18, drop=150)
    n = int((HORN_AT + horn["total"] + 0.2) * SR)
    out = np.zeros(n)

    # Claquement, souffle des confettis qui partent, pluie de papier.
    place(out, soft_pop(rng), 0.0)
    tt = times(0.45)
    whoosh = bandpass(rng.standard_normal(len(tt)), 3000, 0.7) * (1 - np.exp(-tt / 0.01)) * np.exp(-tt / 0.13)
    place(out, 0.22 * whoosh, 0.006)
    out += 0.75 * rustle(rng, n, 0.05, 1.0, 70)

    # « Pouet, pouuuet ».
    place(out, 0.55 * blower(rng, **horn), HORN_AT)
    return finish(room(out, size=0.75, wet=0.13, tail=0.5))


# ── 💥 Boom : coup sourd, souffle qui se referme, débris ─────────────────────


def boom(rng):
    t = times(1.4)
    n = len(t)

    # Attaque : quelques millisecondes de bruit clair, la détonation.
    crack = highpass(rng.standard_normal(n), 2500) * np.exp(-t / 0.004)

    # Souffle : bruit blanc dans un passe-bas qui se referme (6 kHz → 180 Hz).
    fc = 180 + 5800 * np.exp(-t / 0.11)
    env = (1 - np.exp(-t / 0.002)) * (0.9 * np.exp(-t / 0.15) + 0.28 * np.exp(-t / 0.55))
    blast = sweep_lowpass(rng.standard_normal(n), fc) * env
    blast /= np.max(np.abs(blast))

    # Coup : sinus 110 → 42 Hz, saturé, pour la fondamentale manquante.
    thump = np.tanh(3.0 * np.sin(phase_of(42 + 68 * np.exp(-t / 0.08)))) * np.exp(-t / 0.2)

    # Débris : crépitements rares qui retombent.
    debris = np.zeros(n)
    for at in np.sort(0.08 + 0.85 * rng.random(34) ** 1.4):
        g = times(rng.uniform(0.002, 0.006))
        grain = rng.standard_normal(len(g)) * np.exp(-g / 0.0015)
        place(debris, (1 - at) * rng.uniform(0.4, 1.0) * grain, at)
    debris = bandpass(debris, 2600, 1.1)

    out = 0.4 * crack + 0.8 * blast + 0.6 * thump + 0.4 * debris
    out = np.tanh(1.2 * out) / math.tanh(1.2)
    return finish(room(out, size=0.82, wet=0.2, tail=0.7))


# ── 🎺 Sad trombone : « wah wah wah waaah » en sourdine plongeur ─────────────


def trombone(rng):
    # Quatre notes qui descendent d'un demi-ton : ré, do#, do, si.
    notes = [(0.00, 0.37, 293.66), (0.40, 0.37, 277.18), (0.80, 0.37, 261.63), (1.20, 1.30, 246.94)]
    total = notes[-1][0] + notes[-1][1] + 0.08
    t = times(total)
    n = len(t)

    cents = np.zeros(n)  # écart de hauteur en cents autour de la note
    base = np.zeros(n)   # fréquence de la note tenue
    amp = np.zeros(n)
    fc = np.zeros(n)     # ouverture de la sourdine (coupure du formant)

    for k, (at, dur, f) in enumerate(notes):
        last = k == len(notes) - 1
        m = (t >= at) & (t < at + dur + (0.08 if last else 0.03))
        u = t[m] - at
        base[m] = f

        # Coulisse : chaque note arrive par un glissé de 30 ms depuis la
        # précédente et s'affaisse un peu en finissant.
        glide = 100 * np.exp(-u / 0.03) if k > 0 else -40 * np.exp(-u / 0.02)
        droop = -22 * np.clip((u - (dur - 0.09)) / 0.09, 0, 1) if not last else 0
        cents[m] = glide + droop

        # Attaque de langue, puis léger fléchissement ; creux entre deux notes.
        a = (1 - np.exp(-u / 0.03)) * (0.85 + 0.15 * np.exp(-u / 0.12))
        release = np.clip((at + dur - t[m]) / 0.05, 0, 1)
        amp[m] = a * (0.18 + 0.82 * release) if not last else a

        # « Wah » : la sourdine s'ouvre vite (450 → ~1450 Hz) puis se referme à
        # demi ; la dernière note reste plus ouverte.
        fc[m] = 450 + 1400 * (1 - np.exp(-u / 0.03)) - (400 if last else 700) * (1 - np.exp(-u / 0.15))

        if last:
            # La dernière tient : vibrato qui s'élargit, la sourdine bat avec
            # lui (« waa-a-a-ah »), puis tout s'affaisse et se ferme (« …oh »).
            depth = np.clip((u - 0.15) / 0.45, 0, 1)
            vib = np.sin(2 * math.pi * 5.2 * np.clip(u - 0.15, 0, None))
            end = np.clip((u - (dur - 0.45)) / 0.45, 0, 1)
            cents[m] += 34 * depth * vib - 75 * end ** 1.6
            fc[m] = (fc[m] + 500 * depth * vib) * (1 - 0.75 * end) + 250 * end
            amp[m] *= 1 - end ** 1.3

    # Le formant est celui de la sourdine, plus brillant quand le souffle est
    # fort, comme un vrai cuivre.
    out = brass(base * 2 ** (cents / 1200), amp, fc * (0.75 + 0.35 * amp))

    # Souffle dans l'embouchure.
    breath = bandpass(rng.standard_normal(n), 1300, 0.9) * amp
    out = out / np.max(np.abs(out)) + 0.035 * breath

    return finish(room(out, size=0.72, wet=0.14, tail=0.5))


# ── Mesure, encodage ─────────────────────────────────────────────────────────


def ffmpeg(args, data):
    return subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", *args],
        input=data.astype("<f4").tobytes(), capture_output=True, check=True,
    )


def lufs(x):
    log = ffmpeg(["-af", "ebur128", "-f", "null", "-"], x).stderr.decode()
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", log)[-1])


def normalize(x):
    """Gain vers TARGET_LUFS ; un limiteur doux garde la crête sous -1 dBFS."""
    x = x / np.max(np.abs(x)) * 0.5
    for _ in range(3):
        x = x * 10 ** ((TARGET_LUFS - lufs(x)) / 20)
        peak = np.max(np.abs(x))
        if peak > PEAK_CEILING:
            x = np.tanh(x / PEAK_CEILING) * PEAK_CEILING
    return x


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# Chaque son garde la graine de la version écoutée et validée : en changer
# redessine ses parties aléatoires (bruits, reflets de cloche, confettis).
SOUNDS = {"party": (party, 20261104), "boom": (boom, 20261102), "trombone": (trombone, 20261103)}


def main(argv):
    wav_dir = argv[argv.index("--wav") + 1] if "--wav" in argv else None
    for name, (make, seed) in SOUNDS.items():
        x = normalize(make(np.random.default_rng(seed)))
        path = os.path.join(OUT_DIR, f"{name}.mp3")
        ffmpeg(["-y", "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", path], x)
        if wav_dir:
            os.makedirs(wav_dir, exist_ok=True)
            write_wav(os.path.join(wav_dir, f"{name}.wav"), x)
        print(f"{name}.mp3  {len(x) / SR:.2f} s  {lufs(x):.1f} LUFS  crête {20 * math.log10(np.max(np.abs(x))):.1f} dBFS")


if __name__ == "__main__":
    main(sys.argv[1:])
