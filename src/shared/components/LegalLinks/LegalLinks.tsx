import { Link } from "react-router-dom";
import styles from "./LegalLinks.module.css";

export default function LegalLinks() {
  const year = new Date().getFullYear();

  return (
    <nav className={styles.bar} aria-label="Informations légales">
      <span className={styles.copy}>© {year} Bobine</span>
      <span className={`${styles.sep} ${styles.copy}`} aria-hidden="true">
        ·
      </span>
      <Link to="/confidentialite">Confidentialité</Link>
      <span className={styles.sep} aria-hidden="true">
        ·
      </span>
      <Link to="/conditions-utilisation">CGU</Link>
    </nav>
  );
}
