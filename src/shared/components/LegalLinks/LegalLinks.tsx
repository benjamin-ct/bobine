import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "./LegalLinks.module.css";

const INFINITE_SCROLL_PATHS = ["/", "/nouveautes", "/prochainement"];

export default function LegalLinks() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const { pathname } = useLocation();

  if (!INFINITE_SCROLL_PATHS.includes(pathname)) {
    return null;
  }

  return (
    <nav className={styles.bar} aria-label={t("legalLinks.ariaLabel")}>
      <span className={styles.copy}>© {year} Seancy</span>
      <span className={`${styles.sep} ${styles.copy}`} aria-hidden="true">
        ·
      </span>
      <Link to="/confidentialite">{t("legalLinks.privacy")}</Link>
      <span className={styles.sep} aria-hidden="true">
        ·
      </span>
      <Link to="/conditions-utilisation">{t("legalLinks.terms")}</Link>
    </nav>
  );
}
