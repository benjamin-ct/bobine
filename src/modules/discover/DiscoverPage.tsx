import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { discover, getGenres, getWatchProvidersList } from "../../core/api/tmdb.ts";
import { useScrollRestoration } from "../../shared/hooks/useScrollRestoration.ts";
import { useResumableSeries } from "../../shared/hooks/useResumableSeries.ts";
import { useFeaturedSeries } from "../../shared/hooks/useFeaturedSeries.ts";
import { useFeaturedMovies } from "../../shared/hooks/useFeaturedMovies.ts";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useFavoriteProviders } from "../../core/context/FavoriteProvidersContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import {
  MediaCard,
  MediaCardSkeleton,
  FilterPanel,
  DEFAULT_SORT_FIELD,
  DEFAULT_SORT_DIRECTION,
  EMPTY_ADVANCED_FILTERS,
  getAdvancedFiltersRangeError,
  ErrorMessage,
  EmptyState,
  ContinueWatchingRow,
  FeaturedMediaRow,
  Icon,
} from "../../shared/components/index.ts";
import type { AdvancedFiltersState } from "../../shared/components/index.ts";
import type { Genre, MediaItem, MediaType } from "../../core/types/tmdb.ts";
import type { DiscoverSortField, SortDirection, WatchProviderOption } from "../../core/api/tmdb.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import TonightPick from "./TonightPick.tsx";
import styles from "./DiscoverPage.module.css";

const GRID_SKELETON_COUNT = 12;

interface FiltersSnapshot {
  mediaType: MediaType;
  genreIds: number[];
  providerIds: string[];
  useMyPlatforms: boolean;
  sortField: DiscoverSortField;
  sortDirection: SortDirection;
  advanced: AdvancedFiltersState;
}

// Derniers filtres appliqués, mémorisés par entrée d'historique (même
// principe que scrollPositions dans useScrollRestoration) : comme DiscoverPage
// est démonté/remonté à chaque retour arrière, seul un état hors du cycle de
// vie du composant peut survivre pour être réappliqué au remontage.
const filtersMemory = new Map<string, FiltersSnapshot>();

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
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigationType = useNavigationType();
  const restoredFilters = navigationType === "POP" ? filtersMemory.get(location.key) : undefined;

  const [mediaType, setMediaType] = useState<MediaType>(restoredFilters?.mediaType ?? "movie");
  const [genreIds, setGenreIds] = useState<number[]>(restoredFilters?.genreIds ?? []);
  const [providerIds, setProviderIds] = useState<string[]>(restoredFilters?.providerIds ?? []);
  const [useMyPlatforms, setUseMyPlatforms] = useState(restoredFilters?.useMyPlatforms ?? false);
  const [sortField, setSortField] = useState<DiscoverSortField>(
    restoredFilters?.sortField ?? DEFAULT_SORT_FIELD
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    restoredFilters?.sortDirection ?? DEFAULT_SORT_DIRECTION
  );
  const [advanced, setAdvanced] = useState<AdvancedFiltersState>(
    restoredFilters?.advanced ?? EMPTY_ADVANCED_FILTERS
  );
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
    : providerIds.length
      ? providerIds
      : undefined;
  // « année · genre » sous chaque carte : premier genre TMDB du titre.
  const genreNames = useMemo(() => new Map(genres.map((g) => [g.id, g.name])), [genres]);

  // "Séries en cours" : séries entamées avec au moins un épisode non vu déjà
  // sorti (indépendant du filtre Films/Séries de la grille de suggestions
  // ci-dessous).
  const continuingSeries = useResumableSeries(watchlist);
  const continuingSeriesIds = new Set(continuingSeries.map((item) => item.id));

  // "Mise en avant" : séries suivies (watchlist incluse, pas seulement
  // entamées) dont un épisode vient de sortir ou arrive bientôt, et films
  // suivis dont la sortie initiale vient d'avoir lieu ou arrive bientôt —
  // sauf les séries déjà affichées dans "Séries en cours" juste au-dessus, pour ne
  // pas dupliquer la même série dans les deux rangées ("Séries en cours" ne
  // concerne que des séries, jamais des films).
  const featuredSeries = useFeaturedSeries(watchlist).filter(
    ({ item }) => !continuingSeriesIds.has(item.id)
  );
  const featuredMovies = useFeaturedMovies(watchlist, region);
  const featuredItems = [...featuredSeries, ...featuredMovies].sort((a, b) => {
    if (a.badge.kind !== b.badge.kind) {
      return a.badge.kind === "just_released" ? -1 : 1;
    }
    return a.badge.kind === "just_released"
      ? b.badge.date.localeCompare(a.badge.date)
      : a.badge.date.localeCompare(b.badge.date);
  });

  // Ignore le premier passage : au montage, mediaType "change" (de rien à sa
  // valeur initiale, éventuellement restaurée après un retour arrière) sans
  // que ce soit une action de l'utilisateur — réinitialiser genreIds à ce
  // moment-là écraserait les genres restaurés.
  const skipGenreResetRef = useRef(true);
  useEffect(() => {
    if (skipGenreResetRef.current) {
      skipGenreResetRef.current = false;
      return;
    }
    setGenreIds([]);
    setPage(1);
  }, [mediaType]);

  useEffect(() => {
    setPage(1);
  }, [genreIds, providerIds, useMyPlatforms, sortField, sortDirection, advancedKey]);

  // Mémorise les filtres actifs pour cette entrée d'historique, afin de les
  // réappliquer si l'utilisateur revient sur cette page via un retour arrière
  // (bouton navigateur ou bouton "Retour" de la fiche détail, qui déclenche
  // aussi un vrai POP).
  useEffect(() => {
    filtersMemory.set(location.key, {
      mediaType,
      genreIds,
      providerIds,
      useMyPlatforms,
      sortField,
      sortDirection,
      advanced,
    });
  }, [
    location.key,
    mediaType,
    genreIds,
    providerIds,
    useMyPlatforms,
    sortField,
    sortDirection,
    advanced,
  ]);

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
    // i18n.language : les libellés de genres/plateformes viennent de TMDB
    // dans la langue active (tmdbClient.ts), donc un changement de langue
    // doit redéclencher cet appel comme un changement de mediaType/region.
  }, [mediaType, region, i18n.language]);

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
      includeRegionReleaseDate: true,
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
    // i18n.language : discover() renvoie titres/synopsis dans la langue
    // active (tmdbClient.ts) ; sans cette dépendance, changer de langue ne
    // redéclenche pas l'appel et les résultats restent dans l'ancienne
    // langue jusqu'au prochain changement de filtre ou remontage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mediaType,
    genreIds,
    excludedGenreIds,
    providerIds,
    useMyPlatforms,
    favoriteProviderIds,
    region,
    sortField,
    sortDirection,
    advancedKey,
    i18n.language,
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
      includeRegionReleaseDate: true,
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
    providerIds,
    useMyPlatforms,
    favoriteProviderIds,
    region,
    sortField,
    sortDirection,
    advancedKey,
    i18n.language,
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

  useScrollRestoration(status === "success", results.length);

  return (
    <div className={styles.page}>
      <h1 className={styles.srOnly}>{t("discoverPage.title")}</h1>

      <TonightPick />

      {continuingSeries.length > 0 && (
        <section className={styles.shelf}>
          <div className={styles.blockTitle}>
            <span className={styles.blockIcon}>
              <Icon name="repeat" />
            </span>
            <h2>
              {t("discoverPage.resumeTitle")}{" "}
              <span className={styles.meta}>{t("discoverPage.resumeSubtitle")}</span>
            </h2>
          </div>
          <ContinueWatchingRow items={continuingSeries} />
        </section>
      )}

      {featuredItems.length > 0 && (
        <section className={styles.shelf}>
          <div className={styles.blockTitle}>
            <span className={styles.blockIcon}>
              <Icon name="sparkle" />
            </span>
            <h2>
              {t("discoverPage.featuredTitle")}{" "}
              <span className={styles.meta}>{t("discoverPage.featuredSubtitle")}</span>
            </h2>
          </div>
          <FeaturedMediaRow items={featuredItems} />
        </section>
      )}

      <h2 className={styles.sectionTitle}>{t("discoverPage.suggestionsEyebrow")}</h2>
      <FilterPanel
        mediaType={mediaType}
        setMediaType={setMediaType}
        genres={genres}
        genreIds={genreIds}
        setGenreIds={setGenreIds}
        providers={providers}
        providerIds={providerIds}
        setProviderIds={setProviderIds}
        favoriteProviderIds={favoriteProviderIds}
        useMyPlatforms={useMyPlatforms}
        setUseMyPlatforms={setUseMyPlatforms}
        sortField={sortField}
        setSortField={setSortField}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        advanced={advanced}
        setAdvanced={setAdvanced}
      />

      {status === "loading" && (
        <div className={gridStyles.grid}>
          {Array.from({ length: GRID_SKELETON_COUNT }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      )}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "invalid" && advancedError && <EmptyState label={t(advancedError)} />}
      {status === "success" && results.length === 0 && (
        <EmptyState label={t("discoverPage.emptyState")} />
      )}

      {status === "success" && results.length > 0 && (
        <>
          <div className={gridStyles.grid}>
            {results.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                yearGenre
                genreName={genreNames.get(item.genre_ids?.[0] ?? -1)}
              />
            ))}
          </div>
          {page < totalPages && (
            <div ref={sentinelRef} className={gridStyles.loadMore}>
              {loadingMore && <span>{t("common.loading")}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
