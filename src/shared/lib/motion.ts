// Petites animations ponctuelles (retour visuel d'une action, fondu de page)
// jouées via l'API Web Animations plutôt qu'en CSS : une animation CSS liée
// à une classe (ex. .watchedOn) se rejoue au montage, donc sur chaque carte
// déjà « vue » d'une grille. Ici, rien ne bouge tant que l'utilisateur n'a
// pas agi. Aucune bibliothèque : `element.animate` est natif.

const EASE_OUT_BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function play(
  el: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): void {
  if (!el || typeof el.animate !== "function" || prefersReducedMotion()) {
    return;
  }
  el.animate(keyframes, options);
}

/** Petit rebond (icône d'un bouton qui passe à l'état actif). */
export function pop(el: Element | null | undefined, delay = 0): void {
  play(
    el,
    [
      { transform: "scale(1) rotate(0)" },
      { transform: "scale(1.7) rotate(-12deg)", offset: 0.35 },
      { transform: "scale(0.9) rotate(4deg)", offset: 0.7 },
      { transform: "scale(1) rotate(0)" },
    ],
    { duration: 480, delay, easing: EASE_OUT_BACK }
  );
}

/** Étoile de notation qui s'allume : partie éteinte et petite, finit à sa taille. */
export function light(el: Element | null | undefined, delay = 0): void {
  play(
    el,
    [
      { opacity: 0.25, transform: "scale(0.4)" },
      { opacity: 1, transform: "scale(1.6)", offset: 0.55 },
      { opacity: 1, transform: "scale(1)" },
    ],
    // « backwards » : l'étoile reste éteinte pendant son délai, sinon elles
    // s'allumeraient toutes d'un coup avant de rebondir l'une après l'autre.
    { duration: 420, delay, easing: "ease-out", fill: "backwards" }
  );
}

/** Fondu d'entrée d'une page (changement de route). Opacité seule : un
 * transform sur <main> rattacherait à lui, le temps de l'animation, les
 * éléments `position: fixed` de la page (panneau Filtres, dialogues). */
export function fadeIn(el: Element | null | undefined): void {
  play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: "ease-out" });
}
