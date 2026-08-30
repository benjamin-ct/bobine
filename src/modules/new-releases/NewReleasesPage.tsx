import { useCallback, useEffect, useRef, useState } from "react";
import { discover, getGenres, getWatchProvidersList } from "../../core/api/tmdb.ts";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useFavoriteProviders } from "../../core/context/FavoriteProvidersContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import {
  MediaCard,
  FilterBar,
  CountryLanguageFilter,
  Chip,
  Loading,
  ErrorMessage,
  EmptyState,
  PageHeader,
} from "../../shared/components/index.ts";
import type { Genre, MediaItem, MediaType } from "../../core/types/tmdb.ts";
import type { WatchProviderOption } from "../../core/api/tmdb.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import styles from "./NewReleasesPage.module.css";

const WINDOWS = [
  { value: 7, label: "7 derniers jours" },
  { value: 30, label: "30 derniers jours" },
  { value: 90, label: "3 derniers mois" },
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Fenêtre [aujourd'hui - windowDays ; aujourd'hui] : uniquement des titres
// déjà sortis (pas de bornes ouvertes vers le futur, sinon TMDB renvoie
// aussi des sorties à venir déjà programmées).
function dateRangeFor(windowDays: number) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - windowDays);
  return { dateFrom: toIsoDate(from), dateTo: toIsoDate(today) };
}

export default function NewReleasesPage() {
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [providerId, setProviderId] = useState("");
  const [useMyPlatforms, setUseMyPlatforms] = useState(false);
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [providers, setProviders] = useState<WatchProviderOption[]>([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
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

  // Ignore le premier montage : sinon `setGenreIds([])` y crée un nouveau
  // tableau vide (référence différente de l'état initial), ce qui redéclenche
  // l'effet discover() juste après le premier appel — deux appels API
  // identiques à l'ouverture de la page pour rien.
  const isFirstMediaTypeRender = useRef(true);
  useEffect(() => {
    if (isFirstMediaTypeRender.current) {
      isFirstMediaTypeRender.current = false;
      return;
    }
    setGenreIds([]);
    setPage(1);
  }, [mediaType]);

  useEffect(() => {
    setPage(1);
  }, [genreIds, providerId, useMyPlatforms, country, language, windowDays]);

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
    let cancelled = false;
    setStatus("loading");
    discover(mediaType, {
      page: 1,
      genreId: genreIds,
      excludeGenreIds: excludedGenreIds,
      providerIds: activeProviderIds,
      region,
      originCountry: country || undefined,
      originalLanguage: language || undefined,
      sortField: "popularity",
      sortDirection: "desc",
      includeProviderBadge: true,
      ...dateRangeFor(windowDays),
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
    country,
    language,
    windowDays,
  ]);

  const loadMore = useCallback(() => {
    if (loadingMore || page >= totalPages) {
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
      originCountry: country || undefined,
      originalLanguage: language || undefined,
      sortField: "popularity",
      sortDirection: "desc",
      includeProviderBadge: true,
      ...dateRangeFor(windowDays),
    })
      .then((data) => {
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
    mediaType,
    genreIds,
    excludedGenreIds,
    providerId,
    useMyPlatforms,
    favoriteProviderIds,
    region,
    country,
    language,
    windowDays,
  ]);

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
        eyebrow="Mis à jour aujourd'hui"
        title="Nouveautés"
        lead="Les derniers ajouts en streaming et les sorties fraîches en salles — filtrés pour vos plateformes."
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

      {status === "loading" && <Loading />}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "success" && results.length === 0 && (
        <EmptyState label="Aucune sortie sur cette période pour ces filtres." />
      )}

      {status === "success" && results.length > 0 && (
        <>
          <div className={gridStyles.grid}>
            {results.map((item) => (
              <MediaCard key={item.id} item={item} showProviderBadge />
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
