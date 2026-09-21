import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "./Footer.module.css";

export default function Footer() {
  const { t } = useTranslation();
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
        <span className={styles.meta}>{t("footer.tagline")}</span>
        <nav className={styles.links}>
          <Link to="/conditions-utilisation">{t("footer.terms")}</Link>
          <Link to="/confidentialite">{t("footer.privacy")}</Link>
        </nav>
      </div>
    </footer>
  );
}
