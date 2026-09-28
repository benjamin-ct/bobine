import { useEffect, useState } from "react";

// Sous ce seuil (haut de page), la barre reste toujours visible.
const TOP_ZONE_PX = 80;
// Déplacement minimal avant de changer d'état : évite que la barre clignote
// sur de petits à-coups du doigt ou le rebond élastique de Safari iOS.
const DELTA_PX = 10;

// Renvoie true quand l'élément doit être masqué : on descend dans la page,
// il se cache ; on remonte (ou on revient en haut), il réapparaît.
// `resetKey` (le chemin de la page, typiquement) le réaffiche à chaque
// changement ; `enabled` à false le garde visible.
export default function useHideOnScroll(resetKey: unknown, enabled = true): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    if (!enabled) {
      return;
    }
    // Position de référence : dernière position où l'état a été décidé.
    let anchorY = window.scrollY;
    let frame = 0;

    function update() {
      frame = 0;
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      // Bornée : le rebond élastique en haut/bas de page donne des scrollY
      // négatifs ou au-delà du maximum, qu'il faut ignorer.
      const y = Math.min(Math.max(window.scrollY, 0), Math.max(maxY, 0));
      if (y <= TOP_ZONE_PX) {
        setHidden(false);
        anchorY = y;
        return;
      }
      const delta = y - anchorY;
      if (Math.abs(delta) < DELTA_PX) {
        return;
      }
      setHidden(delta > 0);
      anchorY = y;
    }

    function onScroll() {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [resetKey, enabled]);

  return enabled && hidden;
}
