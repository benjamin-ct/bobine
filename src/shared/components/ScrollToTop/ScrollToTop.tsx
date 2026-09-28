import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

// Composant invisible : remonte la page en haut à chaque changement de
// route (par défaut, React Router garde la position de scroll telle
// quelle en changeant de page, contrairement à un site multi-pages).
export default function ScrollToTop() {
  const { pathname } = useLocation();

  // Effet de layout : il passe avant ceux de la page (composant frère placé
  // avant <main>), donc avant la restauration de défilement d'un retour
  // (useScrollRestoration), qu'il écrasait sinon en remettant la page en
  // haut, et avant que la nouvelle page ne soit peinte.
  useLayoutEffect(() => {
    // Toujours instantané : avec le `scroll-behavior: smooth` global, la
    // nouvelle page s'affichait défilée puis remontait sous les yeux (0,4 s),
    // et une transition d'affiche (motion.ts, morphPoster) la photographiait
    // encore défilée.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
