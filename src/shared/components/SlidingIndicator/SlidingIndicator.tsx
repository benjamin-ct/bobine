import { useLayoutEffect, useRef } from "react";
import styles from "./SlidingIndicator.module.css";

// Bouton actif du groupe : même attribut ARIA que celui qui le marque déjà
// (bascule, choix unique ou lien de navigation).
const ACTIVE_SELECTOR = '[aria-pressed="true"], [aria-checked="true"], [aria-current="page"]';

interface SlidingIndicatorProps {
  /** Valeur sélectionnée : la pastille se replace quand elle change. */
  activeKey: unknown;
}

/**
 * Pastille de sélection qui glisse d'un bouton à l'autre dans un groupe
 * exclusif (Films/Séries, source du tirage, langue, onglets de l'en-tête).
 * À placer en premier enfant du groupe, qui doit être en `position:
 * relative` ; les boutons, en `position: relative` eux aussi, passent
 * au-dessus et ne gardent de leur état actif que la couleur du texte.
 */
export default function SlidingIndicator({ activeKey }: SlidingIndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const indicator = ref.current;
    const group = indicator?.parentElement;
    if (!indicator || !group) {
      return;
    }
    let frame = 0;
    const place = () => {
      const active = group.querySelector<HTMLElement>(ACTIVE_SELECTOR);
      indicator.hidden = !active;
      if (!active) {
        // Réapparition sur place, sans glisser depuis l'ancienne position.
        delete indicator.dataset.ready;
        return;
      }
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.height = `${active.offsetHeight}px`;
      indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      // Premier placement sans transition, sinon la pastille partirait du
      // coin du groupe.
      if (indicator.dataset.ready === undefined) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          indicator.dataset.ready = "";
        });
      }
    };
    place();
    // Largeurs qui changent après coup : police chargée, langue, compteur...
    const observer = new ResizeObserver(place);
    observer.observe(group);
    for (const child of group.children) {
      observer.observe(child);
    }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [activeKey]);

  return <span ref={ref} className={styles.indicator} aria-hidden="true" />;
}
