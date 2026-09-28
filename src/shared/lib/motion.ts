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

// ─── Affiche qui s'agrandit vers la fiche (View Transitions) ───────────────
// Au clic sur une carte, son affiche glisse et grandit jusqu'à sa place sur
// la fiche. « Retour » n'a pas de trajet inverse, seulement le fondu de page
// (il saccadait sur Safari iOS). Le navigateur photographie
// l'avant et l'après, et anime entre les deux l'élément qui porte le même
// `view-transition-name` des deux côtés. L'affiche de la fiche le porte en
// CSS (global.css, [data-morph-poster]), celle du squelette non : l'affiche
// du squelette n'est ni à la même place ni à la même taille, et la fiche
// qui la remplace en pleine animation la faisait sauter. Côté
// cartes, le nom n'est posé que le temps de la transition, en inline : il
// doit être unique dans la page, alors qu'une grille compte des dizaines
// d'affiches. Navigateur sans View Transitions ou « réduire les
// animations » : navigation normale.

const POSTER_TRANSITION_NAME = "media-poster";
let posterTransitionRunning = false;

/** Vrai pendant une transition d'affiche (le fondu de page s'efface alors). */
export function isPosterTransitionRunning(): boolean {
  return posterTransitionRunning;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lance `go` (la navigation) dans une transition qui fait passer l'affiche
 * `from` à l'élément renvoyé par `findTarget` une fois la nouvelle page
 * affichée. Renvoie false sans rien faire si la transition n'est pas
 * possible : l'appelant navigue alors normalement.
 */
export function morphPoster(
  from: HTMLElement | null,
  go: () => void,
  findTarget: () => HTMLElement | null
): boolean {
  if (
    !from ||
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function" ||
    prefersReducedMotion()
  ) {
    return false;
  }
  let target: HTMLElement | null = null;
  // Fiche → autre fiche (saga, recommandations) : l'affiche de la fiche
  // actuelle porte déjà le nom ; deux noms identiques annuleraient tout.
  const others = Array.from(document.querySelectorAll<HTMLElement>("[data-morph-poster]")).filter(
    (el) => el !== from
  );
  others.forEach((el) => (el.style.viewTransitionName = "none"));
  from.style.viewTransitionName = POSTER_TRANSITION_NAME;
  posterTransitionRunning = true;
  const transition = document.startViewTransition(async () => {
    from.style.viewTransitionName = "";
    // React peut réutiliser le même nœud pour la nouvelle fiche.
    others.forEach((el) => (el.style.viewTransitionName = ""));
    go();
    // La navigation de React Router est asynchrone (startTransition, ou
    // popstate pour un retour), et la fiche attend sa requête /movie ou /tv :
    // on attend que la nouvelle page affiche l'affiche cible, 600 ms au plus.
    // Passé ce délai, l'ancienne affiche se fond avec le reste de la page.
    // setTimeout et non requestAnimationFrame, suspendu pendant la capture.
    const start = performance.now();
    while (!(target = findTarget()) && performance.now() - start < 600) {
      await wait(16);
    }
    // Image pas encore décodée : l'affiche arriverait vide puis apparaîtrait
    // en pleine animation (clignotement). Elle est en cache (même URL que la
    // carte), le décodage est court.
    const img = target?.querySelector("img");
    if (img && typeof img.decode === "function") {
      await Promise.race([img.decode().catch(() => undefined), wait(150)]);
    }
    // Laisse passer les effets de la nouvelle page (remise en haut du
    // défilement) avant la photo de l'après.
    await wait(16);
    if (target && !target.hasAttribute("data-morph-poster")) {
      target.style.viewTransitionName = POSTER_TRANSITION_NAME;
    }
  });
  transition.finished.finally(() => {
    posterTransitionRunning = false;
    if (target) {
      target.style.viewTransitionName = "";
    }
  });
  return true;
}

/** Affiche de la fiche ouverte (DetailPage ou son squelette). */
export function findDetailPoster(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-morph-poster]");
}
