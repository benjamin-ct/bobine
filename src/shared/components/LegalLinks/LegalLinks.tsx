import { Link, useLocation } from "react-router-dom";
import styles from "./LegalLinks.module.css";

const INFINITE_SCROLL_PATHS = ["/", "/nouveautes", "/prochainement"];

export default function LegalLinks() {
  const year = new Date().getFullYear();
  const { pathname } = useLocation();

  if (!INFINITE_SCROLL_PATHS.includes(pathname)) {
    return null;
  }

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
