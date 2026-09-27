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
import { SettingsGroup } from "./components/SettingsGroup.tsx";
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

      {/* Nouvelle DA 8/10 : tout ce qui décrit le comportement de l'app
          (recommandations, notifications, affichage), présenté en groupes et
          en lignes comme l'onglet Compte. */}
      {tab === "preferences" && (
        <div className={styles.settings}>
          <SettingsGroup
            title={t("profile.recommendations")}
            description={t("profile.recommendationsLead")}
          >
            <FavoriteProvidersSettings />
            <ExcludedGenresSettings />
            <ExcludedTitlesSettings />
          </SettingsGroup>

          <SettingsGroup
            title={t("profile.notifications")}
            description={t("profile.notificationsLead")}
          >
            <NotificationSettings />
          </SettingsGroup>

          <SettingsGroup title={t("profile.display")} description={t("profile.displayLead")}>
            <LanguageSettings />
            <RegionSettings />
            <ThemeSettings />
          </SettingsGroup>
        </div>
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
