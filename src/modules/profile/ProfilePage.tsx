import { PageHeader } from "../../shared/components/index.ts";
import AccountCard from "./components/AccountCard.tsx";
import NotificationSettings from "./components/NotificationSettings.tsx";
import FavoriteProvidersSettings from "./components/FavoriteProvidersSettings.tsx";
import ExcludedGenresSettings from "./components/ExcludedGenresSettings.tsx";
import ExcludedTitlesSettings from "./components/ExcludedTitlesSettings.tsx";
import styles from "./ProfilePage.module.css";

// NOUVEAU (repris de la maquette HTML) : page Profil séparée de Ma liste —
// le Projet A regroupait avant migration les réglages (notifications,
// plateformes favorites, genres exclus) directement dans MyList.jsx.
export default function ProfilePage() {
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Réglages"
        title="Profil"
        lead="Votre compte et vos préférences de recommandation, réunis au même endroit."
      />

      <div className={styles.grid}>
        <div className={styles.span6}>
          <AccountCard />
        </div>
        <div className={styles.span6}>
          <div className={styles.ticket}>
            <span className={styles.k}>Notifications</span>
            <p className={styles.hint}>
              Prévenu·e quand un titre « envie de voir » arrive en streaming, pour vos genres
              préférés et les grosses sorties.
            </p>
            <NotificationSettings />
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <h2>Recommandations</h2>
        <div className={styles.discGrid}>
          <FavoriteProvidersSettings />
          <ExcludedGenresSettings />
          <ExcludedTitlesSettings />
        </div>
      </section>
    </div>
  );
}
