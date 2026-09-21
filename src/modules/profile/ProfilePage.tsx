import { useTranslation } from "react-i18next";
import { PageHeader } from "../../shared/components/index.ts";
import AccountCard from "./components/AccountCard.tsx";
import NotificationSettings from "./components/NotificationSettings.tsx";
import FavoriteProvidersSettings from "./components/FavoriteProvidersSettings.tsx";
import ExcludedGenresSettings from "./components/ExcludedGenresSettings.tsx";
import ExcludedTitlesSettings from "./components/ExcludedTitlesSettings.tsx";
import RegionSettings from "./components/RegionSettings.tsx";
import styles from "./ProfilePage.module.css";

// NOUVEAU (repris de la maquette HTML) : page Profil séparée de Ma liste —
// le Projet A regroupait avant migration les réglages (notifications,
// plateformes favorites, genres exclus) directement dans MyList.jsx.
export default function ProfilePage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={t("profile.eyebrow")}
        title={t("profile.title")}
        lead={t("profile.lead")}
      />

      <div className={styles.grid}>
        <div className={styles.span6}>
          <AccountCard />
        </div>
        <div className={styles.span6}>
          <div className={styles.ticket}>
            <span className={styles.k}>{t("profile.notifications")}</span>
            <p className={styles.hint}>{t("profile.notificationsHint")}</p>
            <NotificationSettings />
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <h2>{t("profile.recommendations")}</h2>
        <div className={styles.discGrid}>
          <RegionSettings />
          <FavoriteProvidersSettings />
          <ExcludedGenresSettings />
          <ExcludedTitlesSettings />
        </div>
      </section>
    </div>
  );
}
