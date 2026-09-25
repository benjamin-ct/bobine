import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  PageHeader,
  MediaCard,
  Loading,
  ErrorMessage,
  EmptyState,
} from "../../shared/components/index.ts";
import { libraryItemToMediaItem } from "../../shared/lib/libraryItem.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import type { LibraryItem, PublicProfile } from "../../core/types/library.ts";
import styles from "./PublicProfilePage.module.css";

type Tab = "seen" | "want" | string; // string = id de liste personnalisée

type State =
  | { status: "loading" }
  | { status: "success"; profile: PublicProfile }
  | { status: "not-found" }
  | { status: "error"; error: Error };

const RECENT_COUNT = 6;

function ItemGrid({ items }: { items: LibraryItem[] }) {
  const { t } = useTranslation();
  return (
    <div className={gridStyles.grid}>
      {items.map((item) => (
        <div key={`${item.mediaType}:${item.id}`}>
          <MediaCard item={libraryItemToMediaItem(item)} />
          {item.rating != null && (
            <p className={styles.rating}>{t("publicProfile.rating", { rating: item.rating })}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// Profil d'un autre membre, partagé en lecture seule via /u/<slug> (voir
// ProfileShareCard) : accessible sans compte. Les cartes restent les
// MediaCard habituelles — leurs boutons « vu »/« envie de voir » agissent
// sur la bibliothèque du visiteur, jamais sur celle du profil consulté.
export default function PublicProfilePage() {
  const { t } = useTranslation();
  const { slug = "" } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("seen");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setTab("seen");
    fetch(`/api/public-profile/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) {
          return { status: "not-found" } as const;
        }
        if (!res.ok) {
          throw new Error(t("publicProfile.loadError"));
        }
        return { status: "success", profile: (await res.json()) as PublicProfile } as const;
      })
      .then((next) => {
        if (!cancelled) {
          setState(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            error: err instanceof Error ? err : new Error(t("publicProfile.loadError")),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  if (state.status === "loading") {
    return <Loading />;
  }
  if (state.status === "error") {
    return (
      <div className={styles.page}>
        <ErrorMessage error={state.error} />
      </div>
    );
  }
  if (state.status === "not-found") {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow={t("publicProfile.eyebrow")}
          title={t("publicProfile.notFoundTitle")}
          lead={t("publicProfile.notFoundLead")}
        />
        <Link to="/" className={styles.homeLink}>
          {t("notFound.backToHome")}
        </Link>
      </div>
    );
  }

  const { profile } = state;
  const name = profile.displayName || t("publicProfile.anonymousName");
  const activeList = profile.customLists.find((l) => l.id === tab);
  const recent = profile.watched.slice(0, RECENT_COUNT);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={t("publicProfile.eyebrow")}
        title={name}
        lead={t("publicProfile.lead", {
          watched: profile.watched.length,
          watchlist: profile.watchlist.length,
          lists: profile.customLists.length,
        })}
      />

      {recent.length > 0 && (
        <section className={styles.section}>
          <h2>{t("publicProfile.recent")}</h2>
          <ItemGrid items={recent} />
        </section>
      )}

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          className={`${styles.tab} ${tab === "seen" ? styles.tabActive : ""}`}
          onClick={() => setTab("seen")}
        >
          {t("myListPage.tabSeen")} <span className={styles.count}>{profile.watched.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "want" ? styles.tabActive : ""}`}
          onClick={() => setTab("want")}
        >
          {t("myListPage.tabWant")} <span className={styles.count}>{profile.watchlist.length}</span>
        </button>
        {profile.customLists.map((list) => (
          <button
            key={list.id}
            type="button"
            className={`${styles.tab} ${tab === list.id ? styles.tabActive : ""}`}
            onClick={() => setTab(list.id)}
          >
            {list.name} <span className={styles.count}>{list.items.length}</span>
          </button>
        ))}
      </div>

      {tab === "seen" &&
        (profile.watched.length === 0 ? (
          <EmptyState label={t("publicProfile.emptySeen")} />
        ) : (
          <ItemGrid items={profile.watched} />
        ))}

      {tab === "want" &&
        (profile.watchlist.length === 0 ? (
          <EmptyState label={t("publicProfile.emptyWant")} />
        ) : (
          <ItemGrid items={profile.watchlist} />
        ))}

      {activeList &&
        (activeList.items.length === 0 ? (
          <EmptyState label={t("publicProfile.emptyList")} />
        ) : (
          <ItemGrid items={activeList.items} />
        ))}
    </div>
  );
}
