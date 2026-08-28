import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Dropdown.module.css";

interface DropdownProps {
  label: ReactNode;
  active?: boolean;
  align?: "left" | "right";
  children: ReactNode;
}

/** Menu déroulant générique (déclencheur "pilule" + panneau), utilisé pour
 * le filtre de genres (sélection multiple) et le tri — voir FilterBar. Se
 * ferme au clic extérieur ou à l'échap ; un seul composant plutôt que
 * dupliqué par filtre (voir README, "Non-duplication avec l'existant"). */
export default function Dropdown({
  label,
  active = false,
  align = "left",
  children,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger} ${active ? styles.active : ""}`}
        onClick={() => setOpen((o) => !o)}
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
      {open && (
        <div className={`${styles.panel} ${align === "right" ? styles.panelRight : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}
