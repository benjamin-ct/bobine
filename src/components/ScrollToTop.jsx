import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Composant invisible : remonte la page en haut à chaque changement de
// route (par défaut, React Router garde la position de scroll telle
// quelle en changeant de page, contrairement à un site multi-pages).
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
