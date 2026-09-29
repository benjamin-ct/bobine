import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Éléments atteignables au clavier dans `container`, dans l'ordre du DOM. */
export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0
  );
}

/**
 * Tant que `active` est vrai : met le focus dans `containerRef` (premier
 * élément atteignable, ou le conteneur lui-même), garde Tab / Maj+Tab à
 * l'intérieur, puis rend le focus à l'élément qui l'avait avant (le
 * déclencheur) à la désactivation (audit H14). Pour les panneaux qui ne
 * peuvent pas être un `<dialog>` natif (feuille de filtres, menus en
 * portail). Une touche Tab pressée hors du conteneur (ex. dans un menu
 * ouvert par-dessus) n'est pas interceptée.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) {
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = focusableIn(container)[0];
    if (first) {
      first.focus();
    } else {
      container.tabIndex = -1;
      container.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !container || !container.contains(document.activeElement)) {
        return;
      }
      const items = focusableIn(container);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? index <= 0
          ? items[items.length - 1]
          : items[index - 1]
        : index === items.length - 1
          ? items[0]
          : items[index + 1];
      e.preventDefault();
      next.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Seulement si le focus est resté dans le panneau (ou sur <body>) :
      // un clic ailleurs a déjà placé le focus où l'utilisateur le voulait.
      const current = document.activeElement;
      if (
        previouslyFocused?.isConnected &&
        (!current || current === document.body || container.contains(current))
      ) {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, active]);
}
