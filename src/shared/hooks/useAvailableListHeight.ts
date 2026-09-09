import { useCallback, useLayoutEffect, useState } from "react";

// Hauteur "confortable" visée quand la place ne manque pas, et plancher en
// dessous duquel la liste resterait inutilisable même si la page doit
// scroller pour l'atteindre.
const COMFORTABLE_HEIGHT = 320;
const MIN_HEIGHT = 140;
// Marge gardée entre le bas de la liste et le bas du viewport : évite que la
// liste colle pile au bord et laisse un peu d'air avant le footer.
const BOTTOM_MARGIN = 24;

// Calcule dynamiquement le `max-height` d'une liste scrollable (panneaux
// "Mes plateformes" / "Genres à exclure" / "Titres exclus" du profil) à
// partir de la place réellement disponible sous son point d'ouverture,
// plutôt qu'un pourcentage fixe du viewport (`min(320px, 30vh)`) qui ne sait
// pas ce qu'il y a au-dessus (texte d'intro, barre de recherche...) ni en
// dessous (footer). Deux listes ouvertes côte à côte, même avec un contenu
// au-dessus de hauteur différente, se retrouvent ainsi limitées à la même
// position verticale plutôt que de s'arrêter à des hauteurs différentes.
//
// La hauteur du <footer> (seul élément après <main> dans le flux — voir
// App.tsx) est explicitement réservée : sans ça, le calcul ne laissait de la
// place que jusqu'au bas du viewport, sans compter que le footer a lui-même
// une hauteur à faire tenir en dessous, ce qui continuait à pousser la page
// en scroll d'exactement cette hauteur-là.
//
// Le nœud DOM est suivi via une callback ref (état React), pas un
// `useRef` classique : "Mes plateformes" et "Genres à exclure" ne montent
// leur grille qu'une fois leurs données chargées (`status === "success"`),
// donc `open` passe à `true` *avant* que le nœud n'existe. Avec un
// `useRef`, l'effet ne se redéclenche jamais une fois le nœud monté (ni
// `active` ni l'identité du ref n'ont changé depuis) et `maxHeight` reste
// bloqué sur la valeur par défaut, non plafonnée par la place réelle — ce
// qui repoussait le footer hors du viewport à la première ouverture.
export function useAvailableListHeight(active: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [maxHeight, setMaxHeight] = useState(COMFORTABLE_HEIGHT);
  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);

  useLayoutEffect(() => {
    if (!active || !node) {
      return;
    }
    const recompute = () => {
      const footerHeight = document.querySelector("footer")?.getBoundingClientRect().height ?? 0;
      const available =
        window.innerHeight - node.getBoundingClientRect().top - footerHeight - BOTTOM_MARGIN;
      setMaxHeight(Math.max(MIN_HEIGHT, Math.min(COMFORTABLE_HEIGHT, available)));
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [active, node]);

  return [maxHeight, ref] as const;
}
