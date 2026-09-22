import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../shared/components/index.ts";
import MyListContent from "../my-list/index.ts";
import AccountCard from "./components/AccountCard.tsx";
import NotificationSettings from "./components/NotificationSettings.tsx";
import FavoriteProvidersSettings from "./components/FavoriteProvidersSettings.tsx";
import ExcludedGenresSettings from "./components/ExcludedGenresSettings.tsx";
import ExcludedTitlesSettings from "./components/ExcludedTitlesSettings.tsx";
import RegionSettings from "./components/RegionSettings.tsx";
import LanguageSettings from "./components/LanguageSettings.tsx";
import styles from "./ProfilePage.module.css";

type Tab = "compte" | "preferences" | "ma-liste";
const TABS: Tab[] = ["compte", "preferences", "ma-liste"];

// NOUVEAU (repris de la maquette HTML) : page Profil séparée de Ma liste —
// le Projet A regroupait avant migration les réglages (notifications,
// plateformes favorites, genres exclus) directement dans MyList.jsx.
export default function ProfilePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "compte";

  function selectTab(next: Tab) {
    setSearchParams(next === "compte" ? {} : { tab: next });
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={t("profile.eyebrow")}
        title={t("profile.title")}
        lead={t("profile.lead")}
      />

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          className={`${styles.tab} ${tab === "compte" ? styles.tabActive : ""}`}
          onClick={() => selectTab("compte")}
        >
          {t("profile.tabAccount")}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "preferences" ? styles.tabActive : ""}`}
          onClick={() => selectTab("preferences")}
        >
          {t("profile.tabPreferences")}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "ma-liste" ? styles.tabActive : ""}`}
          onClick={() => selectTab("ma-liste")}
        >
          {t("profile.tabMyList")}
        </button>
      </div>

      {tab === "compte" && (
        <>
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
              <FavoriteProvidersSettings />
              <ExcludedGenresSettings />
              <ExcludedTitlesSettings />
            </div>
          </section>
        </>
      )}

      {tab === "preferences" && (
        <section className={styles.section}>
          <h2>{t("profile.tabPreferences")}</h2>
          <div className={styles.discGrid}>
            <LanguageSettings />
            <RegionSettings />
          </div>
        </section>
      )}

      {tab === "ma-liste" && (
        <section className={styles.section}>
          <MyListContent />
        </section>
      )}
    </div>
  );
}
