import { useLayoutEffect, useState, type RefObject } from "react";

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
export function useAvailableListHeight(active: boolean, ref: RefObject<HTMLElement | null>) {
  const [maxHeight, setMaxHeight] = useState(COMFORTABLE_HEIGHT);

  useLayoutEffect(() => {
    if (!active || !ref.current) {
      return;
    }
    const el = ref.current;
    const recompute = () => {
      const footerHeight = document.querySelector("footer")?.getBoundingClientRect().height ?? 0;
      const available =
        window.innerHeight - el.getBoundingClientRect().top - footerHeight - BOTTOM_MARGIN;
      setMaxHeight(Math.max(MIN_HEIGHT, Math.min(COMFORTABLE_HEIGHT, available)));
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [active, ref]);

  return maxHeight;
}
