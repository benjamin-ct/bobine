import { useEffect, useState, type RefObject } from "react";

/** Passe à `true` (une seule fois) quand l'élément approche du viewport.
 * Sert à ne lancer les appels TMDB d'un badge (plateforme, prochaine
 * sortie...) que pour les éléments bientôt visibles : sans ça, une grille ou
 * une liste de ~20 titres déclenche tous ses appels dès le montage, y
 * compris hors écran — pic qui épuise le quota de la clé TMDB partagée. */
export function useNearViewport(ref: RefObject<Element | null>, enabled: boolean): boolean {
  const [isNear, setIsNear] = useState(false);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const el = ref.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return isNear;
}
