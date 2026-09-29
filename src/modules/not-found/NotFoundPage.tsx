import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../shared/hooks/useDocumentTitle.ts";
import { PageHeader } from "../../shared/components/index.ts";
import styles from "./NotFoundPage.module.css";

/** Page affichée pour toute URL qui ne correspond à aucune route connue
 * (lien mort, faute de frappe, ancien favori) — évite une zone de contenu
 * vide sous le header/footer. */
export default function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("pageTitle.notFound"));

  // Les URL inconnues répondent 200 (index.html de l’appli monopage) : ce
  // noindex évite qu’un moteur les indexe comme de vraies pages (audit H12).
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

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
