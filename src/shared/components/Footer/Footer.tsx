import { Link } from "react-router-dom";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.row}>
        <span className={styles.brand}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            aria-hidden="true"
            className={styles.reel}
          >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
          </svg>
          Bobine
        </span>
        <span className={styles.meta}>Découvre, suis, et retrouve tes films &amp; séries.</span>
        <nav className={styles.links}>
          <Link to="/conditions-utilisation">Conditions d'utilisation</Link>
          <Link to="/confidentialite">Confidentialité</Link>
        </nav>
      </div>
    </footer>
  );
}
