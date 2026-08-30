import { useCallback, useEffect, useRef, useState } from "react";
import { discover, getGenres, getWatchProvidersList } from "../../core/api/tmdb.ts";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useFavoriteProviders } from "../../core/context/FavoriteProvidersContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import {
  MediaCard,
  FilterBar,
  AdvancedFilters,
  EMPTY_ADVANCED_FILTERS,
  getAdvancedFiltersRangeError,
  Loading,
  ErrorMessage,
  EmptyState,
  PageHeader,
  ContinueWatchingRow,
} from "../../shared/components/index.ts";
import type { AdvancedFiltersState } from "../../shared/components/index.ts";
import type { Genre, MediaItem, MediaType } from "../../core/types/tmdb.ts";
import type { DiscoverSortField, SortDirection, WatchProviderOption } from "../../core/api/tmdb.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import styles from "./DiscoverPage.module.css";

// Convertit les valeurs texte des <input> en nombres (ou undefined si vide)
// pour discover().
function toDiscoverParams(advanced: AdvancedFiltersState) {
  const num = (v: string) => (v === "" || v == null ? undefined : Number(v));
  return {
    yearMin: num(advanced.yearMin),
    yearMax: num(advanced.yearMax),
    voteAverageMin: num(advanced.voteAverageMin),
    voteAverageMax: num(advanced.voteAverageMax),
    voteCountMin: num(advanced.voteCountMin),
    runtimeMin: num(advanced.runtimeMin),
    runtimeMax: num(advanced.runtimeMax),
    originCountry: advanced.originCountry || undefined,
  };
}

export default function DiscoverPage() {
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [providerId, setProviderId] = useState("");
  const [useMyPlatforms, setUseMyPlatforms] = useState(false);
  const [sortField, setSortField] = useState<DiscoverSortField>("popularity");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [advanced, setAdvanced] = useState<AdvancedFiltersState>(EMPTY_ADVANCED_FILTERS);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [providers, setProviders] = useState<WatchProviderOption[]>([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "invalid">(
    "idle"
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { region } = useRegion();
  const { favoriteProviderIds } = useFavoriteProviders();
  const { excludedGenreIds } = useExcludedGenres();
  const { filterExcluded } = useExcludedTitles();
  const { watchlist } = useLibrary();

  const advancedKey = JSON.stringify(advanced);
  const advancedError = getAdvancedFiltersRangeError(advanced);
  const activeProviderIds = useMyPlatforms
    ? favoriteProviderIds
    : providerId
      ? [providerId]
      : undefined;

  // "Reprendre" : séries entamées, tous types confondus (indépendant du
  // filtre Films/Séries de la grille de suggestions ci-dessous).
  const continuingSeries = watchlist.filter(
    (item) => item.mediaType === "tv" && (item.watchedEpisodes?.length || 0) > 0
  );

  useEffect(() => {
    setGenreIds([]);
    setPage(1);
  }, [mediaType]);

  useEffect(() => {
    setPage(1);
  }, [genreIds, providerId, useMyPlatforms, sortField, sortDirection, advancedKey]);

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

  useEffect(() => {
    if (advancedError) {
      // Plage min/max incohérente (ex. note min > note max) : on n'appelle
      // pas l'API, qui retomberait silencieusement sur 0 résultat.
      setResults([]);
      setStatus("invalid");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    discover(mediaType, {
      page: 1,
      genreId: genreIds,
      excludeGenreIds: excludedGenreIds,
      providerIds: activeProviderIds,
      region,
      sortField,
      sortDirection,
      excludeUpcoming: true,
      ...toDiscoverParams(advanced),
    })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setResults(filterExcluded(data.results, mediaType).map((r) => ({ ...r, mediaType })));
        setTotalPages(Math.min(data.total_pages || 1, 500));
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
  }, [
    mediaType,
    genreIds,
    excludedGenreIds,
    providerId,
    useMyPlatforms,
    favoriteProviderIds,
    region,
    sortField,
    sortDirection,
    advancedKey,
  ]);

  const loadMore = useCallback(() => {
    if (loadingMore || page >= totalPages || advancedError) {
      return;
    }
    const nextPage = page + 1;
    setLoadingMore(true);
    discover(mediaType, {
      page: nextPage,
      genreId: genreIds,
      excludeGenreIds: excludedGenreIds,
      providerIds: activeProviderIds,
      region,
      sortField,
      sortDirection,
      excludeUpcoming: true,
      ...toDiscoverParams(advanced),
    })
      .then((data) => {
        // TMDB peut renvoyer un même titre sur deux pages consécutives : on
        // déduplique pour éviter les doublons à l'écran.
        setResults((prev) => {
          const seenIds = new Set(prev.map((item) => item.id));
          const fresh = filterExcluded(data.results, mediaType)
            .filter((item) => !seenIds.has(item.id))
            .map((r) => ({ ...r, mediaType }));
          return [...prev, ...fresh];
        });
        setPage(nextPage);
      })
      .catch((err) => setError(err))
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loadingMore,
    page,
    totalPages,
    advancedError,
    mediaType,
    genreIds,
    excludedGenreIds,
    providerId,
    useMyPlatforms,
    favoriteProviderIds,
    region,
    sortField,
    sortDirection,
    advancedKey,
  ]);

  // Sentinelle observée pour déclencher le chargement de la page suivante
  // dès qu'elle approche du bas de l'écran (scroll infini, plus de bouton).
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

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Rien que pour vous"
        title="Découvrir"
        lead="Une sélection qui apprend de vos goûts — ce que vous avez vu, aimé, zappé, et ce qui patiente dans votre liste."
      />

      {continuingSeries.length > 0 && (
        <section className={styles.resumeShelf}>
          <div className={styles.blockTitle}>
            <span className={styles.resumeIcon}>
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <h2>
              Reprendre <span className={styles.meta}>· là où vous en êtes</span>
            </h2>
          </div>
          <ContinueWatchingRow items={continuingSeries} />
        </section>
      )}

      <p className={styles.eyebrowSmall}>Suggestions pour vous</p>
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
        sortField={sortField}
        setSortField={setSortField}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
      />

      <AdvancedFilters filters={advanced} setFilters={setAdvanced} />

      {status === "loading" && <Loading />}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "invalid" && advancedError && <EmptyState label={advancedError} />}
      {status === "success" && results.length === 0 && (
        <EmptyState label="Aucun résultat pour ces filtres." />
      )}

      {status === "success" && results.length > 0 && (
        <>
          <div className={gridStyles.grid}>
            {results.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
          {page < totalPages && (
            <div ref={sentinelRef} className={gridStyles.loadMore}>
              {loadingMore && <span>Chargement…</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
