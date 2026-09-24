import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { discover, getGenres, getWatchProvidersList } from "../../core/api/tmdb.ts";
import { getRecommendations, markNotInterested } from "../../core/api/recommendations.ts";
import type { RecommendationItem, RecommendationReason } from "../../core/api/recommendations.ts";
import { useScrollRestoration } from "../../shared/hooks/useScrollRestoration.ts";
import { useResumableSeries } from "../../shared/hooks/useResumableSeries.ts";
import { useFeaturedSeries } from "../../shared/hooks/useFeaturedSeries.ts";
import { useFeaturedMovies } from "../../shared/hooks/useFeaturedMovies.ts";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useAuth } from "../../core/context/AuthContext.tsx";
import { useFavoriteProviders } from "../../core/context/FavoriteProvidersContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import {
  MediaCard,
  MediaCardSkeleton,
  FilterBar,
  AdvancedFilters,
  EMPTY_ADVANCED_FILTERS,
  getAdvancedFiltersRangeError,
  ErrorMessage,
  EmptyState,
  PageHeader,
  ContinueWatchingRow,
  FeaturedMediaRow,
} from "../../shared/components/index.ts";
import type { AdvancedFiltersState } from "../../shared/components/index.ts";
import type { Genre, MediaItem, MediaType } from "../../core/types/tmdb.ts";
import type { DiscoverSortField, SortDirection, WatchProviderOption } from "../../core/api/tmdb.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import styles from "./DiscoverPage.module.css";

const GRID_SKELETON_COUNT = 12;
// Mix "Suggestions pour vous" (voir DISCUSSION carte Trello) : la grille par
// défaut (aucun filtre actif) d'un compte authentifié remplace le discover()
// brut par le moteur de recommandation, avec quelques sorties récentes
// (issues du même discover() par défaut, déjà filtré des titres exclus/pas
// intéressé) intercalées pour garder de la fraîcheur. RECENT_MIX_INTERVAL :
// une sortie récente insérée toutes les N recommandations personnalisées.
const RECENT_MIX_COUNT = 4;
const RECENT_MIX_INTERVAL = 5;

interface FiltersSnapshot {
  mediaType: MediaType;
  genreIds: number[];
  providerId: string;
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
  const [providerId, setProviderId] = useState(restoredFilters?.providerId ?? "");
  const [useMyPlatforms, setUseMyPlatforms] = useState(restoredFilters?.useMyPlatforms ?? false);
  const [sortField, setSortField] = useState<DiscoverSortField>(
    restoredFilters?.sortField ?? "popularity"
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    restoredFilters?.sortDirection ?? "desc"
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
  const { status: authStatus } = useAuth();
  const { favoriteProviderIds } = useFavoriteProviders();
  const { excludedGenreIds } = useExcludedGenres();
  const { filterExcluded, toggleExcludedTitle } = useExcludedTitles();
  const { watchlist } = useLibrary();

  const [recommended, setRecommended] = useState<RecommendationItem[]>([]);
  const [recStatus, setRecStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [coldStart, setColdStart] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  const advancedKey = JSON.stringify(advanced);
  const advancedError = getAdvancedFiltersRangeError(advanced);
  const activeProviderIds = useMyPlatforms
    ? favoriteProviderIds
    : providerId
      ? [providerId]
      : undefined;

  // Grille par défaut (aucun filtre explicite touché) d'un compte connecté :
  // dès qu'un filtre est choisi à la main, on repasse sur le discover()
  // classique — la personnalisation ne cherche pas à composer avec des
  // filtres arbitraires (genre/plateforme/tri), voir carte Trello.
  const isDefaultFilters =
    genreIds.length === 0 &&
    !providerId &&
    !useMyPlatforms &&
    sortField === "popularity" &&
    sortDirection === "desc" &&
    advancedKey === JSON.stringify(EMPTY_ADVANCED_FILTERS);
  const personalizedModeActive = authStatus === "authenticated" && isDefaultFilters;
  const suggestionsMixed = personalizedModeActive && recStatus === "success";

  // "Reprendre" : séries entamées avec au moins un épisode non vu déjà
  // sorti (indépendant du filtre Films/Séries de la grille de suggestions
  // ci-dessous).
  const continuingSeries = useResumableSeries(watchlist);
  const continuingSeriesIds = new Set(continuingSeries.map((item) => item.id));

  // "Mise en avant" : séries suivies (watchlist incluse, pas seulement
  // entamées) dont un épisode vient de sortir ou arrive bientôt, et films
  // suivis dont la sortie initiale vient d'avoir lieu ou arrive bientôt —
  // sauf les séries déjà affichées dans "Reprendre" juste au-dessus, pour ne
  // pas dupliquer la même série dans les deux rangées ("Reprendre" ne
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
  }, [genreIds, providerId, useMyPlatforms, sortField, sortDirection, advancedKey]);

  // Mémorise les filtres actifs pour cette entrée d'historique, afin de les
  // réappliquer si l'utilisateur revient sur cette page via un retour arrière
  // (bouton navigateur ou bouton "Retour" de la fiche détail, qui déclenche
  // aussi un vrai POP).
  useEffect(() => {
    filtersMemory.set(location.key, {
      mediaType,
      genreIds,
      providerId,
      useMyPlatforms,
      sortField,
      sortDirection,
      advanced,
    });
  }, [
    location.key,
    mediaType,
    genreIds,
    providerId,
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
    providerId,
    useMyPlatforms,
    favoriteProviderIds,
    region,
    sortField,
    sortDirection,
    advancedKey,
    i18n.language,
  ]);

  // Recommandations personnalisées ("Pour toi", voir recommendationEngine.ts
  // côté Worker) : uniquement en mode grille par défaut d'un compte connecté
  // (personalizedModeActive). Le discover() ci-dessus continue de tourner en
  // parallèle dans tous les cas — ses résultats servent de pool "sorties
  // récentes" pour le mix une fois les recommandations chargées.
  useEffect(() => {
    if (!personalizedModeActive) {
      setRecStatus("idle");
      return;
    }
    let cancelled = false;
    setRecStatus("loading");
    getRecommendations(mediaType)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setRecommended(result.items);
        setColdStart(result.coldStart);
        setDismissedKeys(new Set());
        setRecStatus("success");
      })
      .catch(() => {
        // Échec du moteur de recommandation : on retombe silencieusement sur
        // la grille discover() classique (déjà chargée en parallèle) plutôt
        // que d'afficher une erreur pour une simple amélioration de contenu.
        if (!cancelled) {
          setRecStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [personalizedModeActive, mediaType]);

  // Mix personnalisé + sorties récentes non exclues (voir constantes
  // RECENT_MIX_*) : une sortie récente intercalée toutes les
  // RECENT_MIX_INTERVAL recommandations, jusqu'à RECENT_MIX_COUNT au total.
  const mixedFeed = useMemo(() => {
    if (!suggestionsMixed) {
      return [] as Array<{
        item: RecommendationItem | MediaItem;
        reason: RecommendationReason;
        recent: boolean;
      }>;
    }
    const usedIds = new Set(recommended.map((item) => item.id));
    const recentPicks = results.filter((item) => !usedIds.has(item.id)).slice(0, RECENT_MIX_COUNT);
    const entries: Array<{
      item: RecommendationItem | MediaItem;
      reason: RecommendationReason;
      recent: boolean;
    }> = [];
    let recentIndex = 0;
    recommended.forEach((item, index) => {
      entries.push({ item, reason: item.reason, recent: false });
      if ((index + 1) % RECENT_MIX_INTERVAL === 0 && recentIndex < recentPicks.length) {
        entries.push({ item: recentPicks[recentIndex], reason: null, recent: true });
        recentIndex += 1;
      }
    });
    while (recentIndex < recentPicks.length) {
      entries.push({ item: recentPicks[recentIndex], reason: null, recent: true });
      recentIndex += 1;
    }
    return entries.filter((entry) => !dismissedKeys.has(`${mediaType}:${entry.item.id}`));
  }, [suggestionsMixed, recommended, results, dismissedKeys, mediaType]);

  function suggestionReasonText(reason: RecommendationReason, recent: boolean): string {
    if (recent) {
      return t("discoverPage.suggestionsReason.recent");
    }
    if (!reason) {
      return t("discoverPage.suggestionsReason.trending");
    }
    switch (reason.type) {
      case "genre":
        return t("discoverPage.suggestionsReason.genre", {
          genre:
            genres.find((g) => g.id === reason.genreId)?.name ||
            t("discoverPage.suggestionsReason.genreFallback"),
        });
      case "decade":
        return t("discoverPage.suggestionsReason.decade", { decade: reason.decade });
      case "similar_to":
        return t("discoverPage.suggestionsReason.similarTo", { title: reason.sourceTitle });
      case "trending":
      default:
        return t("discoverPage.suggestionsReason.trending");
    }
  }

  function handleNotInterested(item: RecommendationItem | MediaItem) {
    const key = `${mediaType}:${item.id}`;
    setDismissedKeys((prev) => new Set(prev).add(key));
    const title = item.title || item.name || "";
    toggleExcludedTitle(mediaType, item.id, title);
    markNotInterested({
      mediaType,
      tmdbId: item.id,
      genreIds: item.genre_ids || [],
      year: Number((item.release_date || item.first_air_date || "").slice(0, 4)) || null,
    }).catch(() => {
      // Optimiste : même si l'écriture serveur échoue, le titre reste masqué
      // localement (voir ExcludedTitlesContext) — pas grave si le signal
      // d'affinité n'est pas pris en compte cette fois-ci.
    });
  }

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
    providerId,
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
      <PageHeader
        eyebrow={t("discoverPage.eyebrow")}
        title={t("discoverPage.title")}
        lead={t("discoverPage.lead")}
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
              {t("discoverPage.resumeTitle")}{" "}
              <span className={styles.meta}>{t("discoverPage.resumeSubtitle")}</span>
            </h2>
          </div>
          <ContinueWatchingRow items={continuingSeries} />
        </section>
      )}

      {featuredItems.length > 0 && (
        <section className={styles.resumeShelf}>
          <div className={styles.blockTitle}>
            <span className={styles.resumeIcon}>
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                <path d="M12 2l1.9 5.9H20l-5 3.6 1.9 5.9-5-3.6-5 3.6 1.9-5.9-5-3.6h6.1z" />
              </svg>
            </span>
            <h2>
              {t("discoverPage.featuredTitle")}{" "}
              <span className={styles.meta}>{t("discoverPage.featuredSubtitle")}</span>
            </h2>
          </div>
          <FeaturedMediaRow items={featuredItems} />
        </section>
      )}

      <p className={styles.eyebrowSmall}>{t("discoverPage.suggestionsEyebrow")}</p>
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

      {!suggestionsMixed && status === "loading" && (
        <div className={gridStyles.grid}>
          {Array.from({ length: GRID_SKELETON_COUNT }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      )}
      {!suggestionsMixed && status === "error" && <ErrorMessage error={error} />}
      {!suggestionsMixed && status === "invalid" && advancedError && (
        <EmptyState label={t(advancedError)} />
      )}
      {!suggestionsMixed && status === "success" && results.length === 0 && (
        <EmptyState label={t("discoverPage.emptyState")} />
      )}

      {!suggestionsMixed && status === "success" && results.length > 0 && (
        <>
          <div className={gridStyles.grid}>
            {results.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
          {page < totalPages && (
            <div ref={sentinelRef} className={gridStyles.loadMore}>
              {loadingMore && <span>{t("common.loading")}</span>}
            </div>
          )}
        </>
      )}

      {suggestionsMixed && coldStart && (
        <p className={styles.coldStartNotice}>{t("discoverPage.coldStartNotice")}</p>
      )}
      {suggestionsMixed && mixedFeed.length === 0 && (
        <EmptyState label={t("discoverPage.emptyState")} />
      )}
      {suggestionsMixed && mixedFeed.length > 0 && (
        <div className={gridStyles.grid}>
          {mixedFeed.map(({ item, reason, recent }) => (
            <div key={`${recent ? "recent" : "rec"}:${item.id}`} className={styles.suggestionCard}>
              <MediaCard item={item} showProviderBadge />
              <p className={styles.suggestionReason}>{suggestionReasonText(reason, recent)}</p>
              <button
                type="button"
                className={styles.notInterestedBtn}
                onClick={() => handleNotInterested(item)}
              >
                {t("discoverPage.notInterested")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
