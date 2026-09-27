import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Icon from "../Icon/Icon.tsx";
import styles from "./ReadOnlyBanner.module.css";

// Bandeau doré des pages publiques (profil, liste) pour un visiteur non
// connecté : ce qu'il regarde est en lecture seule, et « Créer mon compte »
// l'emmène vers la connexion (un compte se crée au premier lien magique).
export default function ReadOnlyBanner({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={styles.banner}>
      <p className={styles.text}>
        <span className={styles.icon}>
          <Icon name="eye" size={18} />
        </span>
        <span>{children}</span>
      </p>
      <Link to="/connexion" className={styles.cta}>
        <span className={styles.ctaLong}>{t("readOnlyBanner.ctaMobile")}</span>
        <span className={styles.ctaShort}>{t("readOnlyBanner.cta")}</span>
      </Link>
    </div>
  );
}
