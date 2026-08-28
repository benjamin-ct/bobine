import type { ReactNode } from "react";
import styles from "./Disclosure.module.css";

interface DisclosureProps {
  summary: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Déclenché à l'ouverture/fermeture (événement natif `toggle`) — utilisé
   * par les réglages du profil pour ne charger leurs données (genres,
   * plateformes...) qu'à la première ouverture du panneau. */
  onToggle?: (open: boolean) => void;
}

/** Panneau repliable "résumé + contenu" (réglages du profil) — repris de
 * la maquette HTML (`<details>` natif, pas de JS de plus que nécessaire). */
export default function Disclosure({
  summary,
  meta,
  children,
  defaultOpen = false,
  onToggle,
}: DisclosureProps) {
  return (
    <details
      className={styles.disclosure}
      open={defaultOpen}
      onToggle={onToggle ? (e) => onToggle((e.target as HTMLDetailsElement).open) : undefined}
    >
      <summary className={styles.summary}>
        <svg
          className={styles.caret}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        {summary}
        {meta && <span className={styles.meta}>{meta}</span>}
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
