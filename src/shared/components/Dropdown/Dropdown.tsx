import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Dropdown.module.css";

// Doit rester aligné sur .panel { max-height } dans Dropdown.module.css.
const PANEL_MAX_HEIGHT = 340;

interface DropdownProps {
  label: ReactNode;
  active?: boolean;
  align?: "left" | "right";
  /** Aligne le déclencheur sur la pilule "action principale" de la fiche
   * détail (voir .trigger.pill dans Dropdown.module.css) au lieu du style
   * compact par défaut utilisé par la FilterBar et les panneaux de listes. */
  pill?: boolean;
  /** Grise le déclencheur et empêche l'ouverture (ex. Plateformes quand
   * « Seulement mes plateformes » est activé dans FilterPanel). */
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

interface PanelPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

/** Menu déroulant générique (déclencheur "pilule" + panneau), utilisé pour
 * le filtre de genres (sélection multiple), le tri, et "Ajouter à…" sur la
 * fiche — voir FilterBar. Se ferme au clic extérieur ou à l'échap ; un seul
 * composant plutôt que dupliqué par filtre (voir README, "Non-duplication
 * avec l'existant"). Le panneau est rendu via un portail en `position:
 * fixed`, positionné par rapport au bouton déclencheur plutôt qu'imbriqué
 * dans le flux normal : certains parents (le hero de la fiche, `overflow:
 * hidden` pour son fondu d'arrière-plan) rognent sinon le bas du panneau
 * au lieu de le laisser déborder par-dessus le reste du contenu. */
export default function Dropdown({
  label,
  active = false,
  align = "left",
  pill = false,
  disabled = false,
  className,
  children,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    // Ouvre vers le haut quand la place manque en dessous (déclencheur en
    // bas d'écran, ex. dans la feuille de filtres mobile) et qu'il y en a
    // davantage au-dessus — sinon le panneau sortirait de l'écran.
    const spaceBelow = window.innerHeight - rect.bottom;
    const vertical =
      spaceBelow < PANEL_MAX_HEIGHT + 16 && rect.top > spaceBelow
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 };
    setPosition(
      align === "right"
        ? { ...vertical, right: window.innerWidth - rect.right }
        : { ...vertical, left: rect.left }
    );
  }, [align]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    // `capture: true` pour attraper le scroll de n'importe quel ancêtre
    // défilant, pas seulement `window` — le panneau suit sinon son
    // déclencheur avec du retard (ou pas du tout) pendant le défilement.
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <div className={`${styles.dropdown} ${className || ""}`} ref={wrapperRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${pill ? styles.pill : ""} ${active ? styles.active : ""}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {label}
        <svg
          className={`${styles.caret} ${open ? styles.caretOpen : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            style={{
              top: position.top,
              bottom: position.bottom,
              left: position.left,
              right: position.right,
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}
