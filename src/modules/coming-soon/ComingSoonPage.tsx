import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useScrollRestoration } from "../../shared/hooks/useScrollRestoration.ts";
import {
  discover,
  getGenres,
  getWatchProvidersList,
  posterUrl,
  formatFullDate,
} from "../../core/api/tmdb.ts";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useFavoriteProviders } from "../../core/context/FavoriteProvidersContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import {
  FilterBar,
  CountryLanguageFilter,
  Chip,
  ErrorMessage,
  EmptyState,
  PageHeader,
} from "../../shared/components/index.ts";
import ComingSoonSkeleton from "./components/ComingSoonSkeleton.tsx";
import { posterAccentFromGenres } from "../../shared/lib/posterAccent.ts";
import posterStyles from "../../shared/styles/posterAccents.module.css";
import type { DiscoverParams } from "../../core/api/tmdb.ts";
import type { Genre, MediaItem, MediaType } from "../../core/types/tmdb.ts";
import type { WatchProviderOption } from "../../core/api/tmdb.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import styles from "./ComingSoonPage.module.css";

const WINDOWS = [
  { value: 7, label: "7 prochains jours" },
  { value: 30, label: "30 prochains jours" },
  { value: 90, label: "3 prochains mois" },
];

// Nombre de cartes révélées par "page" de scroll infini, et nombre de pages
// TMDB regroupées par lot de fetch (voir plus bas pourquoi un lot plutôt
// qu'une page à la fois).
const REVEAL_SIZE = 20;
const TMDB_PAGES_PER_BATCH = 5;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Fenêtre [demain ; aujourd'hui + windowDays] : uniquement des titres pas
// encore sortis (démarre à demain pour ne pas chevaucher "Nouveautés").
function dateRangeFor(windowDays: number) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() + 1);
  const to = new Date(today);
  to.setDate(to.getDate() + windowDays);
  return { dateFrom: toIsoDate(from), dateTo: toIsoDate(to) };
}

function releaseDateOf(item: MediaItem): string {
  return item.release_date || item.first_air_date || "";
}

function sortByDate(items: MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => releaseDateOf(a).localeCompare(releaseDateOf(b)));
}

function dedupe(items: MediaItem[]): MediaItem[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function fetchPages(
  mediaType: MediaType,
  params: DiscoverParams,
  fromPage: number,
  count: number
) {
  const pages = await Promise.all(
    Array.from({ length: count }, (_, i) => discover(mediaType, { ...params, page: fromPage + i }))
  );
  return pages.flatMap((p) => p.results || []) as MediaItem[];
}

function TimelineItem({ item }: { item: MediaItem }) {
  const { isInWatchlist, toggleWatchlist } = useLibrary();
  const title = item.title || item.name || "Titre inconnu";
  const date = item.release_date || item.first_air_date;
  const notifying = isInWatchlist(item.mediaType, item.id);
  const accentKey = posterAccentFromGenres(item.genre_ids, `${item.mediaType}:${item.id}`);

  return (
    <div className={styles.item}>
      <div className={styles.date}>
        <b>{date ? new Date(date).getDate() : "—"}</b>
        <span>
          {date
            ? new Date(date).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")
            : ""}
        </span>
      </div>
      <Link to={`/media/${item.mediaType}/${item.id}`} className={styles.thumb}>
        {item.poster_path ? (
          <img src={posterUrl(item.poster_path, "w92") ?? undefined} alt={title} />
        ) : (
          <div className={posterStyles[accentKey]} style={{ width: "100%", height: "100%" }} />
        )}
      </Link>
      <Link to={`/media/${item.mediaType}/${item.id}`} className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.sub}>
          {formatFullDate(date) || (date ? date.slice(0, 4) : "Date à confirmer")}
        </div>
      </Link>
      <button
        type="button"
        className={`${styles.bell} ${notifying ? styles.bellOn : ""}`}
        aria-pressed={notifying}
        title="Être prévenu·e de la sortie (ajoute à Envie de voir)"
        onClick={() =>
          toggleWatchlist({
            id: item.id,
            mediaType: item.mediaType,
            title,
            posterPath: item.poster_path ?? null,
            date,
            genreIds: item.genre_ids || [],
          })
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        <span>{notifying ? "Prévenu·e" : "Me prévenir"}</span>
      </button>
    </div>
  );
}

export default function ComingSoonPage() {
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [providerId, setProviderId] = useState("");
  const [useMyPlatforms, setUseMyPlatforms] = useState(false);
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [providers, setProviders] = useState<WatchProviderOption[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { region } = useRegion();
  const { favoriteProviderIds } = useFavoriteProviders();
  const { excludedGenreIds } = useExcludedGenres();
  const { filterExcluded } = useExcludedTitles();
  const activeProviderIds = useMyPlatforms
    ? favoriteProviderIds
    : providerId
      ? [providerId]
      : undefined;

  const [allResults, setAllResults] = useState<MediaItem[]>([]);
  const [revealCount, setRevealCount] = useState(REVEAL_SIZE);
  const [fetchedPages, setFetchedPages] = useState(0);
  const [tmdbTotalPages, setTmdbTotalPages] = useState(0);

  useEffect(() => {
    setGenreIds([]);
  }, [mediaType]);

  useEffect(() => {
    let cancelled = false;
    getGenres(mediaType)
      .then((data) => !cancelled && setGenres(data.genres || []))
      .catch(() => !cancelled && setGenres([]));
    getWatchProvidersList(mediaType, region)
      .then((list) => !cancelled && setProviders(list))
      .catch(() => !cancelled && setProviders([]));
    return () => {
      cancelled = true;
    };
  }, [mediaType, region]);

  const discoverParams: DiscoverParams = {
    genreId: genreIds,
    excludeGenreIds: excludedGenreIds,
    providerIds: activeProviderIds,
    region,
    originCountry: country || undefined,
    originalLanguage: language || undefined,
    sortField: "popularity",
    sortDirection: "desc",
    ...dateRangeFor(windowDays),
  };
  const discoverParamsKey = JSON.stringify(discoverParams);

  // Récupère un lot de TMDB_PAGES_PER_BATCH pages TMDB (triées par
  // popularité), les fusionne avec ce qu'on a déjà, trie l'ensemble par
  // date UNE SEULE FOIS, puis les stocke — un lot partiel affiché à l'écran
  // n'est jamais retrié : les cartes déjà visibles ne sautent jamais de
  // position pendant le scroll.
  const fetchBatch = useCallback(
    async (fromPage: number, frozenHead: MediaItem[], tailToMerge: MediaItem[]) => {
      const first = await discover(mediaType, { ...discoverParams, page: fromPage });
      const totalPages = Math.min(first.total_pages || 1, 500);
      const pagesToFetch = Math.min(TMDB_PAGES_PER_BATCH, totalPages - fromPage + 1);
      const rest =
        pagesToFetch > 1
          ? await fetchPages(mediaType, discoverParams, fromPage + 1, pagesToFetch - 1)
          : [];
      const newTail = dedupe(
        filterExcluded([...tailToMerge, ...(first.results as MediaItem[]), ...rest], mediaType)
      );
      return {
        merged: [...frozenHead, ...sortByDate(newTail)].map((r) => ({ ...r, mediaType })),
        totalPages,
        newFetchedPages: fromPage - 1 + pagesToFetch,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mediaType, discoverParamsKey]
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setRevealCount(REVEAL_SIZE);
    fetchBatch(1, [], [])
      .then(({ merged, totalPages, newFetchedPages }) => {
        if (cancelled) {
          return;
        }
        setAllResults(merged);
        setTmdbTotalPages(totalPages);
        setFetchedPages(newFetchedPages);
        setStatus("success");
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchBatch]);

  const loadMore = useCallback(() => {
    if (loadingMore) {
      return;
    }
    if (revealCount < allResults.length) {
      setRevealCount((c) => Math.min(c + REVEAL_SIZE, allResults.length));
      return;
    }
    if (fetchedPages >= tmdbTotalPages) {
      return;
    }
    setLoadingMore(true);
    const frozenHead = allResults.slice(0, revealCount);
    const tailToMerge = allResults.slice(revealCount);
    fetchBatch(fetchedPages + 1, frozenHead, tailToMerge)
      .then(({ merged, totalPages, newFetchedPages }) => {
        setAllResults(merged);
        setTmdbTotalPages(totalPages);
        setFetchedPages(newFetchedPages);
        setRevealCount((c) => Math.min(c + REVEAL_SIZE, merged.length));
      })
      .catch((err) => setError(err))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, revealCount, allResults, fetchedPages, tmdbTotalPages, fetchBatch]);

  const hasMore = revealCount < allResults.length || fetchedPages < tmdbTotalPages;
  const visibleResults = allResults.slice(0, revealCount);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status !== "success") {
      return;
    }
    const el = sentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, loadMore]);

  useScrollRestoration(status === "success", visibleResults.length);

  // Regroupement par mois pour l'affichage calendrier (repris de la maquette
  // HTML) — calculé au rendu, pas de tri supplémentaire (visibleResults est
  // déjà trié par date, voir fetchBatch).
  let currentMonth = "";

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Calendrier · France"
        title="Prochainement"
        lead="Les sorties à venir, en salles et en streaming. Activez la cloche pour être prévenu·e le jour J."
      />

      <FilterBar
        mediaType={mediaType}
        setMediaType={setMediaType}
        genreIds={genreIds}
        setGenreIds={setGenreIds}
        genres={genres}
        providerId={providerId}
        setProviderId={setProviderId}
        providers={providers}
        favoriteProviderIds={favoriteProviderIds}
        useFavoriteProviders={useMyPlatforms}
        setUseFavoriteProviders={setUseMyPlatforms}
      />

      <CountryLanguageFilter
        country={country}
        setCountry={setCountry}
        language={language}
        setLanguage={setLanguage}
      />

      <div className={styles.windowRow}>
        {WINDOWS.map((w) => (
          <Chip
            key={w.value}
            active={windowDays === w.value}
            onClick={() => setWindowDays(w.value)}
          >
            {w.label}
          </Chip>
        ))}
      </div>

      {status === "loading" && <ComingSoonSkeleton />}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "success" && visibleResults.length === 0 && (
        <EmptyState label="Aucune sortie prévue sur cette période pour ces filtres." />
      )}

      {status === "success" && visibleResults.length > 0 && (
        <>
          <div className={styles.timeline}>
            {visibleResults.map((item) => {
              const date = item.release_date || item.first_air_date;
              const label = date ? monthLabel(date) : "Date à confirmer";
              const showMonthHeading = label !== currentMonth;
              currentMonth = label;
              return (
                <div key={`${item.mediaType}:${item.id}`}>
                  {showMonthHeading && <div className={styles.monthHeading}>{label}</div>}
                  <TimelineItem item={item} />
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div ref={sentinelRef} className={gridStyles.loadMore}>
              {loadingMore && <span>Chargement…</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
