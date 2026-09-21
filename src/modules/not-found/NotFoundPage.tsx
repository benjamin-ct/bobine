import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../shared/components/index.ts";
import styles from "./NotFoundPage.module.css";

/** Page affichée pour toute URL qui ne correspond à aucune route connue
 * (lien mort, faute de frappe, ancien favori) — évite une zone de contenu
 * vide sous le header/footer. */
export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={t("notFound.eyebrow")}
        title={t("notFound.title")}
        lead={t("notFound.lead")}
      />
      <Link to="/" className={styles.homeLink}>
        {t("notFound.backToHome")}
      </Link>
    </div>
  );
}
