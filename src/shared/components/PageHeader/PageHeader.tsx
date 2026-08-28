import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
}

/** En-tête de page standard (surtitre / titre / chapô) — repris de la
 * maquette HTML, partagé par tous les modules plutôt que rejoué à
 * l'identique dans chaque page. */
export default function PageHeader({ eyebrow, title, lead }: PageHeaderProps) {
  return (
    <div className={styles.head}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
      {lead && <p className={styles.lead}>{lead}</p>}
    </div>
  );
}
