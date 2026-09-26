import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FollowStats, ProfileList } from "../../../shared/components/index.ts";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import { getFeed, getFollowList, searchProfiles } from "../../../core/api/follows.ts";
import { posterUrl } from "../../../core/api/tmdb.ts";
import type { FeedEntry, FollowCounts, ProfileSummary } from "../../../core/types/social.ts";
import styles from "./CommunityPanel.module.css";

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

type Loadable<T> =
  { status: "loading" } | { status: "success"; data: T } | { status: "error"; message: string };

function useFollowCounts(): [FollowCounts | null, () => void] {
  const [counts, setCounts] = useState<FollowCounts | null>(null);
  const reload = useCallback(() => {
    Promise.all([getFollowList(null, "followers"), getFollowList(null, "following")])
      .then(([followers, following]) =>
        setCounts({ followers: followers.length, following: following.length })
      )
      .catch(() => setCounts((current) => current ?? { followers: 0, following: 0 }));
  }, []);
  useEffect(reload, [reload]);
  return [counts, reload];
}

function FeedItem({ entry }: { entry: FeedEntry }) {
  const { t, i18n } = useTranslation();
  const { profile, item, status } = entry;
  const name = profile.displayName || t("publicProfile.anonymousName");
  const action =
    status === "watchlist"
      ? t("community.feedWantToSee")
      : item.rating != null
        ? t("community.feedRated", { rating: item.rating })
        : t("community.feedWatched");
  const poster = posterUrl(item.posterPath, "w92");
  return (
    <li className={styles.feedItem}>
      <Link to={`/media/${item.mediaType}/${item.id}`} className={styles.poster}>
        {poster ? <img src={poster} alt="" loading="lazy" /> : <span aria-hidden="true">🎬</span>}
      </Link>
      <div className={styles.feedText}>
        <p>
          <Link to={`/u/${profile.slug}`} className={styles.who}>
            {name}
          </Link>{" "}
          {action}{" "}
          <Link to={`/media/${item.mediaType}/${item.id}`} className={styles.what}>
            {item.title}
          </Link>
        </p>
        <time className={styles.when} dateTime={new Date(item.updatedAt).toISOString()}>
          {new Date(item.updatedAt).toLocaleDateString(i18n.language, {
            day: "numeric",
            month: "short",
          })}
        </time>
      </div>
    </li>
  );
}

// Onglet « Communauté » du profil : mes abonnés / abonnements, recherche de
// profils partagés par nom affiché, et fil d'activité des profils suivis.
export default function CommunityPanel() {
  const { t } = useTranslation();
  const { shareSlug } = useAuth();
  const [counts, reloadCounts] = useFollowCounts();
  const [feed, setFeed] = useState<Loadable<FeedEntry[]>>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Loadable<ProfileSummary[]> | null>(null);

  const reloadFeed = useCallback(() => {
    getFeed()
      .then((data) => setFeed({ status: "success", data }))
      .catch((err: unknown) =>
        setFeed({
          status: "error",
          message: err instanceof Error ? err.message : t("follow.error"),
        })
      );
  }, [t]);
  useEffect(reloadFeed, [reloadFeed]);

  // Suivre/ne plus suivre change à la fois mes compteurs et mon fil.
  const onFollowChange = useCallback(() => {
    reloadCounts();
    reloadFeed();
  }, [reloadCounts, reloadFeed]);

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setResults({ status: "loading" });
      searchProfiles(trimmed)
        .then((data) => {
          if (!cancelled) {
            setResults({ status: "success", data });
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setResults({
              status: "error",
              message: err instanceof Error ? err.message : t("follow.error"),
            });
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, t]);

  return (
    <div className={styles.panel}>
      <div className={styles.card}>
        <span className={styles.k}>{t("community.myNetwork")}</span>
        {counts && <FollowStats slug={null} counts={counts} onListChange={onFollowChange} />}
        {!shareSlug && <p className={styles.hint}>{t("community.privateHint")}</p>}
      </div>

      <div className={styles.card}>
        <label className={styles.k} htmlFor="profile-search">
          {t("community.searchLabel")}
        </label>
        <input
          id="profile-search"
          type="search"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("community.searchPlaceholder")}
          maxLength={50}
          autoComplete="off"
        />
        {results?.status === "loading" && <p className={styles.hint}>{t("common.loading")}</p>}
        {results?.status === "error" && <p className={styles.hint}>{results.message}</p>}
        {results?.status === "success" &&
          (results.data.length === 0 ? (
            <p className={styles.hint}>{t("community.noResults")}</p>
          ) : (
            <ProfileList
              profiles={results.data}
              onFollowChange={(index, following) => {
                setResults({
                  status: "success",
                  data: results.data.map((p, i) =>
                    i === index ? { ...p, viewerFollows: following } : p
                  ),
                });
                onFollowChange();
              }}
            />
          ))}
      </div>

      <section className={styles.feed}>
        <h2>{t("community.feedTitle")}</h2>
        {feed.status === "loading" && <p className={styles.hint}>{t("common.loading")}</p>}
        {feed.status === "error" && <p className={styles.hint}>{feed.message}</p>}
        {feed.status === "success" &&
          (feed.data.length === 0 ? (
            <p className={styles.hint}>{t("community.feedEmpty")}</p>
          ) : (
            <ul className={styles.feedList}>
              {feed.data.map((entry) => (
                <FeedItem
                  key={`${entry.profile.slug}:${entry.item.mediaType}:${entry.item.id}`}
                  entry={entry}
                />
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}
