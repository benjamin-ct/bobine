import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Position de scroll mémorisée par entrée d'historique (clé unique fournie
// par React Router), en mémoire pour la durée de la session : permet de
// restaurer la position exacte après un retour navigateur, une fois le
// contenu revenu à l'écran.
const scrollPositions = new Map<string, number>();

// À utiliser dans une page à défilement infini pour restaurer la position de
// scroll après un retour navigateur (au lieu de rester en haut de page,
// comportement forcé par ScrollToTop pour toute autre navigation).
//
// `ready` doit passer à `true` une fois le premier lot de résultats affiché,
// et `versionKey` doit changer à chaque nouveau lot chargé (ex. le nombre
// d'éléments affichés) : comme le chargement d'une page suivante est
// déclenché par la visibilité de la sentinelle en bas de liste, restaurer un
// scroll qui dépasse le contenu actuellement chargé déclenche automatiquement
// les chargements suivants jusqu'à atteindre la position d'origine (ou la fin
// de la liste).
export function useScrollRestoration(ready: boolean, versionKey: number | string) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const restoredRef = useRef(false);

  useEffect(() => {
    restoredRef.current = false;
  }, [location.key]);

  useEffect(() => {
    const handleScroll = () => {
      scrollPositions.set(location.key, window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [location.key]);

  useLayoutEffect(() => {
    if (!ready || restoredRef.current || navigationType !== "POP") {
      return;
    }
    const saved = scrollPositions.get(location.key);
    if (saved == null) {
      restoredRef.current = true;
      return;
    }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(saved, Math.max(maxScroll, 0)));
    if (maxScroll >= saved) {
      restoredRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, navigationType, location.key, versionKey]);
}
