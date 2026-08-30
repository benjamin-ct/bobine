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
  // Cible figée pour la restauration en cours (distincte de scrollPositions,
  // pour ne pas être écrasée par les scrolls programmatiques ci-dessous).
  const targetRef = useRef<number | null>(null);
  const restoringRef = useRef(false);

  useLayoutEffect(() => {
    targetRef.current =
      navigationType === "POP" ? (scrollPositions.get(location.key) ?? null) : null;
    restoringRef.current = targetRef.current != null;
  }, [location.key, navigationType]);

  useEffect(() => {
    const handleScroll = () => {
      // Pendant la restauration, window.scrollTo() ci-dessous déclenche
      // aussi cet écouteur : ignorer ces scrolls-là pour ne pas écraser la
      // cible avant qu'elle soit atteinte.
      if (!restoringRef.current) {
        scrollPositions.set(location.key, window.scrollY);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [location.key]);

  useLayoutEffect(() => {
    if (!restoringRef.current || !ready || navigationType !== "POP") {
      return;
    }
    const target = targetRef.current;
    if (target == null) {
      return;
    }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const isFinalStep = maxScroll >= target;
    // Tant que l'infinite scroll charge encore du contenu manquant, les étapes
    // intermédiaires restent instantanées : les enchaîner en `smooth` relance une
    // animation par-dessus la précédente à chaque nouveau lot, d'où les saccades
    // observées auparavant. Seule la dernière étape, une fois la cible atteignable,
    // est animée (behavior explicite : le CSS global `scroll-behavior: smooth`
    // ne s'applique qu'en son absence).
    window.scrollTo({
      top: Math.min(target, Math.max(maxScroll, 0)),
      left: 0,
      behavior: isFinalStep ? "smooth" : "instant",
    });
    if (isFinalStep) {
      restoringRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, navigationType, location.key, versionKey]);
}
