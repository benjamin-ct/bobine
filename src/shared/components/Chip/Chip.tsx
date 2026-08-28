import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Chip.module.css";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

/** Bouton "pilule" générique (filtres, bascules) — un seul composant pour
 * tous les modules plutôt que la classe CSS globale `.chip` dupliquée dans
 * chaque page (voir README, "Non-duplication avec l'existant"). */
export default function Chip({ active = false, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${active ? styles.active : ""} ${className || ""}`}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}
