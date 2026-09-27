import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isPosterTransitionRunning } from "../../lib/motion.ts";

// Composant invisible : remonte la page en haut à chaque changement de
// route (par défaut, React Router garde la position de scroll telle
// quelle en changeant de page, contrairement à un site multi-pages).
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Instantané pendant une transition d'affiche (motion.ts, morphPoster) :
    // le `scroll-behavior: smooth` global n'avance pas pendant la capture,
    // et la fiche serait photographiée encore défilée.
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: isPosterTransitionRunning() ? "instant" : undefined,
    });
  }, [pathname]);

  return null;
}
