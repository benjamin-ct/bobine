import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getRecommendations, markNotInterested } from "../../core/api/recommendations.ts";
import type { RecommendationFilter, RecommendationItem } from "../../core/api/recommendations.ts";
import { getGenres } from "../../core/api/tmdb.ts";
import { useAuth } from "../../core/context/AuthContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import {
  MediaCard,
  MediaCardSkeleton,
  Chip,
  ErrorMessage,
  EmptyState,
  PageHeader,
} from "../../shared/components/index.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import styles from "./ForYouPage.module.css";

const GRID_SKELETON_COUNT = 12;

const FILTERS: { value: RecommendationFilter; key: string }[] = [
  { value: "all", key: "all" },
  { value: "movie", key: "movies" },
  { value: "tv", key: "series" },
];

export default function ForYouPage() {
  const { t } = useTranslation();
  const { status: authStatus } = useAuth();
  const { toggleExcludedTitle } = useExcludedTitles();

  const [filter, setFilter] = useState<RecommendationFilter>("all");
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [coldStart, setColdStart] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<Error | null>(null);
  const [genreNames, setGenreNames] = useState<Record<number, string>>({});
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([getGenres("movie"), getGenres("tv")])
      .then(([movies, tv]) => {
        const map: Record<number, string> = {};
        for (const genre of [...(movies.genres || []), ...(tv.genres || [])]) {
          map[genre.id] = genre.name;
        }
        setGenreNames(map);
      })
      .catch(() => setGenreNames({}));
  }, []);

  const load = useCallback(() => {
    if (authStatus !== "authenticated") {
      return;
    }
    setStatus("loading");
    setError(null);
    getRecommendations(filter)
      .then((result) => {
        setItems(result.items);
        setColdStart(result.coldStart);
        setDismissedKeys(new Set());
        setStatus("success");
      })
      .catch((err) => {
        setError(err as Error);
        setStatus("error");
      });
  }, [authStatus, filter]);

  useEffect(() => {
    load();
  }, [load]);

  function reasonText(item: RecommendationItem): string {
    const reason = item.reason;
    if (!reason) {
      return t("forYouPage.reason.trending");
    }
    switch (reason.type) {
      case "genre":
        return t("forYouPage.reason.genre", {
          genre: genreNames[reason.genreId] || t("forYouPage.reason.genreFallback"),
        });
      case "decade":
        return t("forYouPage.reason.decade", { decade: reason.decade });
      case "similar_to":
        return t("forYouPage.reason.similarTo", { title: reason.sourceTitle });
      case "trending":
      default:
        return t("forYouPage.reason.trending");
    }
  }

  function handleNotInterested(item: RecommendationItem) {
    const key = `${item.mediaType}:${item.id}`;
    setDismissedKeys((prev) => new Set(prev).add(key));
    const title = item.title || item.name || "";
    toggleExcludedTitle(item.mediaType, item.id, title);
    markNotInterested({
      mediaType: item.mediaType,
      tmdbId: item.id,
      genreIds: item.genre_ids || [],
      year: Number((item.release_date || item.first_air_date || "").slice(0, 4)) || null,
    }).catch(() => {
      // Optimiste : même si l'écriture serveur échoue, le titre reste masqué
      // localement (voir ExcludedTitlesContext) — pas grave si le signal
      // d'affinité n'est pas pris en compte cette fois-ci.
    });
  }

  const visibleItems = items.filter((item) => !dismissedKeys.has(`${item.mediaType}:${item.id}`));

  if (authStatus === "loading") {
    return null;
  }

  if (authStatus === "anonymous") {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow={t("forYouPage.eyebrow")}
          title={t("forYouPage.title")}
          lead={t("forYouPage.lead")}
        />
        <div className={styles.loginPrompt}>
          <p>{t("forYouPage.loginPrompt")}</p>
          <Link to="/connexion" className={styles.loginBtn}>
            {t("forYouPage.loginCta")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={t("forYouPage.eyebrow")}
        title={t("forYouPage.title")}
        lead={t("forYouPage.lead")}
      />

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {t(`forYouPage.filters.${f.key}`)}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={load}
          disabled={status === "loading"}
        >
          {t("forYouPage.refresh")}
        </button>
      </div>

      {coldStart && status === "success" && (
        <p className={styles.coldStartNotice}>{t("forYouPage.coldStartNotice")}</p>
      )}

      {status === "loading" && (
        <div className={gridStyles.grid}>
          {Array.from({ length: GRID_SKELETON_COUNT }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      )}

      {status === "error" && <ErrorMessage error={error} />}

      {status === "success" && visibleItems.length === 0 && (
        <EmptyState label={t("forYouPage.emptyState")} />
      )}

      {status === "success" && visibleItems.length > 0 && (
        <div className={gridStyles.grid}>
          {visibleItems.map((item) => (
            <div key={`${item.mediaType}:${item.id}`} className={styles.card}>
              <MediaCard item={item} showProviderBadge />
              <p className={styles.reason}>{reasonText(item)}</p>
              <button
                type="button"
                className={styles.notInterestedBtn}
                onClick={() => handleNotInterested(item)}
              >
                {t("forYouPage.notInterested")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
