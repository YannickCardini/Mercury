/**
 * Fond spatial des landings « jouer », porté depuis
 * src/app/shared/space-background.component.{ts,scss} (fond global de l'app
 * Angular) sans dépendre d'Angular ni de JS côté client.
 *
 * Deux différences volontaires avec le composant d'origine :
 *   - le champ d'étoiles (des centaines de points en `box-shadow`, générés
 *     aléatoirement par `buildStars()` dans le composant) est ici tiré une
 *     fois *au build*, pas à chaque chargement de page. Ces pages sont du
 *     HTML statique lu par des crawlers sans JS (voir site.mjs) : le semis
 *     doit donc déjà être présent dans le marquage, pas injecté au runtime.
 *   - aucune logique de route ni de vaisseau piloté en JS : ces landings ne
 *     sont jamais la route /game, donc seul le mode « non calme » de
 *     l'app a un sens ici.
 *
 * Le rendu visuel (dégradés, keyframes, timings) est repris à l'identique du
 * SCSS d'origine pour rester cohérent avec le reste du site.
 */

/** Même générateur que `buildStars()` du composant Angular. */
function buildStars(count, maxBlur, rgb) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(Math.random() * 2000);
    const y = Math.round(Math.random() * 2000);
    const blur = (Math.random() * maxBlur).toFixed(1);
    const alpha = (0.45 + Math.random() * 0.55).toFixed(2);
    parts.push(`${x}px ${y}px ${blur}px rgba(${rgb},${alpha})`);
  }
  return parts.join(",");
}

/** Même générateur que `buildTwinkles()` du composant Angular. */
function buildTwinkles(count) {
  return Array.from({ length: count }, () => ({
    top: (Math.random() * 100).toFixed(2),
    left: (Math.random() * 100).toFixed(2),
    size: (1.5 + Math.random() * 2).toFixed(2),
    delay: (Math.random() * 8).toFixed(2),
    duration: (4 + Math.random() * 5).toFixed(2),
  }));
}

/**
 * Bloc HTML + le semis d'étoiles inline (via <style>, spécifique à cet
 * appel) : le CSS partagé de content.css ne porte que les règles fixes
 * (position, animation), pas les positions elles-mêmes, qui changent à
 * chaque build.
 */
export function spaceBackground() {
  const starsSmall = buildStars(700, 1, "255,255,255");
  const starsMedium = buildStars(200, 1.6, "255,255,255");
  const starsLarge = buildStars(70, 2.4, "255,255,255");
  const twinkles = buildTwinkles(9);

  const twinklesHtml = twinkles
    .map(
      (t) =>
        `<span class="sb-twinkle" style="top:${t.top}%;left:${t.left}%;width:${t.size}px;height:${t.size}px;animation-delay:${t.delay}s;animation-duration:${t.duration}s"></span>`,
    )
    .join("");

  return `<div class="sb-root" aria-hidden="true">
    <style>
      .sb-stars--small { box-shadow: ${starsSmall}; }
      .sb-stars--medium { box-shadow: ${starsMedium}; }
      .sb-stars--large { box-shadow: ${starsLarge}; }
    </style>
    <div class="sb-nebula sb-nebula--blue"></div>
    <div class="sb-nebula sb-nebula--violet"></div>
    <div class="sb-nebula sb-nebula--cyan"></div>
    <div class="sb-nebula sb-nebula--magenta"></div>
    <div class="sb-nebula sb-nebula--teal"></div>
    <div class="sb-planet sb-planet--giant"></div>
    <div class="sb-planet sb-planet--ringed"><span class="sb-planet__ring"></span></div>
    <div class="sb-planet sb-planet--small"></div>
    <div class="sb-stars sb-stars--small"></div>
    <div class="sb-stars sb-stars--medium"></div>
    <div class="sb-stars sb-stars--large"></div>
    ${twinklesHtml}
    <div class="sb-shooting-star sb-shooting-star--1"></div>
    <div class="sb-shooting-star sb-shooting-star--2"></div>
    <div class="sb-shooting-star sb-shooting-star--3"></div>
  </div>`;
}
