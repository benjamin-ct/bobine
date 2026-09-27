import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader, Loading } from "../../shared/components/index.ts";
import { useAuth } from "../../core/context/AuthContext.tsx";
import MyListContent from "../my-list/index.ts";
import AccountSettings from "./components/AccountSettings.tsx";
import PublicProfileSettings from "./components/PublicProfileSettings.tsx";
import CommunityPanel from "./components/CommunityPanel.tsx";
import NotificationSettings from "./components/NotificationSettings.tsx";
import FavoriteProvidersSettings from "./components/FavoriteProvidersSettings.tsx";
import ExcludedGenresSettings from "./components/ExcludedGenresSettings.tsx";
import ExcludedTitlesSettings from "./components/ExcludedTitlesSettings.tsx";
import RegionSettings from "./components/RegionSettings.tsx";
import LanguageSettings from "./components/LanguageSettings.tsx";
import ThemeSettings from "./components/ThemeSettings.tsx";
import styles from "./ProfilePage.module.css";

type Tab = "compte" | "preferences" | "ma-liste" | "communaute";
const TABS: Tab[] = ["compte", "preferences", "ma-liste", "communaute"];

// NOUVEAU (repris de la maquette HTML) : page Profil séparée de Ma liste —
// le Projet A regroupait avant migration les réglages (notifications,
// plateformes favorites, genres exclus) directement dans MyList.jsx.
export default function ProfilePage() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "compte";

  function selectTab(next: Tab) {
    setSearchParams(next === "compte" ? {} : { tab: next });
  }

  // Page réservée aux membres connectés : un visiteur anonyme est envoyé sur
  // /connexion, qui le ramène sur l'onglet demandé une fois connecté.
  if (status === "loading") {
    return <Loading />;
  }
  if (status === "anonymous") {
    return (
      <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />
    );
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
        <button
          type="button"
          className={`${styles.tab} ${tab === "communaute" ? styles.tabActive : ""}`}
          onClick={() => selectTab("communaute")}
        >
          {t("profile.tabCommunity")}
        </button>
      </div>

      {tab === "compte" && (
        <div className={styles.settings}>
          <AccountSettings />
          <PublicProfileSettings />
        </div>
      )}

      {/* Notifications et Recommandations quittent l'onglet Compte (nouvelle DA
          7/10 : Compte ne garde que l'identité et le profil public) ; leur
          refonte visuelle viendra avec la nouvelle DA 8/10. */}
      {tab === "preferences" && (
        <>
          <section className={styles.section}>
            <h2>{t("profile.recommendations")}</h2>
            <div className={styles.discGrid}>
              <FavoriteProvidersSettings />
              <ExcludedGenresSettings />
              <ExcludedTitlesSettings />
            </div>
          </section>

          <section className={styles.section}>
            <h2>{t("profile.notifications")}</h2>
            <div className={styles.ticket}>
              <p className={styles.hint}>{t("profile.notificationsHint")}</p>
              <NotificationSettings />
            </div>
          </section>

          <section className={styles.section}>
            <h2>{t("profile.display")}</h2>
            <div className={styles.discGrid}>
              <LanguageSettings />
              <RegionSettings />
              <ThemeSettings />
            </div>
          </section>
        </>
      )}

      {tab === "communaute" && (
        <section className={styles.section}>
          <CommunityPanel />
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
