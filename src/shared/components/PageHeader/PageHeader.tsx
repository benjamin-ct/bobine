import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Nouvelle DA : petit spot doré derrière le titre, pour les pages sans
   * hero (Nouveautés...). */
  spot?: boolean;
}

/** En-tête de page standard (surtitre / titre / chapô) — repris de la
 * maquette HTML, partagé par tous les modules plutôt que rejoué à
 * l'identique dans chaque page. */
export default function PageHeader({ eyebrow, title, lead, spot = false }: PageHeaderProps) {
  return (
    <div className={`${styles.head} ${spot ? styles.spot : ""}`}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
      {lead && <p className={styles.lead}>{lead}</p>}
    </div>
  );
}
