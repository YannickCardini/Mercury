# Vue depuis l'Orbasphère (archivée)

Ancien fond du mode jour (la Terre vue depuis la station), remplacé le 2026-10-14 par le matin sur Mars (`resources/mars/`). Jamais vu sur un appareil.

- `orbasphere-day-view.patch` : le gabarit, les styles et le TS de `space-background` tels qu'ils étaient (diff depuis le dernier commit de l'époque, à relire plutôt qu'à appliquer tel quel).
- `earth-weather.webp` (+ `.json`) : la texture de nuages, sortie hors de `src/assets/` pour ne plus alourdir l'app. Pour la réutiliser, la remettre dans `src/assets/orbasphere/`, ou relancer `generate-earth-weather.py` (même sortie à l'octet près).
- Ses tokens de jour (ciel azur `#5aa9e6` → `#e4f3fc`, pied de page en `m-night`, ombre de cadre en haut) ne sont plus dans `tokens.css`.
