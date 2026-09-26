import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { discover, getGenres, getWatchProvidersList } from "../../core/api/tmdb.ts";
import { useScrollRestoration } from "../../shared/hooks/useScrollRestoration.ts";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useFavoriteProviders } from "../../core/context/FavoriteProvidersContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import {
  MediaCard,
  MediaCardSkeleton,
  FilterPanel,
  ErrorMessage,
  EmptyState,
  PageHeader,
} from "../../shared/components/index.ts";
import type { Genre, MediaItem, MediaType } from "../../core/types/tmdb.ts";
import type { WatchProviderOption } from "../../core/api/tmdb.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import styles from "./NewReleasesPage.module.css";

const WINDOWS = [
  { value: 7, key: "last7Days" },
  { value: 30, key: "last30Days" },
  { value: 90, key: "last3Months" },
];

const GRID_SKELETON_COUNT = 12;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIsoDate(d);
}

// Périodes d'affichage (nouvelle DA) : « Cette semaine », « Plus tôt ce
// mois-ci », puis « Plus tôt » pour la fenêtre de 3 mois. Fenêtres
// glissantes, comme les puces de période.
const PERIODS = [
  { key: "thisWeek", days: 7 },
  { key: "earlierThisMonth", days: 30 },
  { key: "earlier", days: Infinity },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

// Regroupe les résultats par période sans changer leur ordre (popularité)
// à l'intérieur d'une période. Un titre sans date, ou daté avant la fenêtre
// (date primaire TMDB plus ancienne que la sortie dans la région), tombe
// dans la dernière période de la fenêtre.
function groupByPeriod(items: MediaItem[], windowDays: number) {
  const periods = PERIODS.filter((_, i) => i === 0 || PERIODS[i - 1].days < windowDays);
  const bounds = periods.map((p) => (p.days === Infinity ? "" : daysAgoIso(p.days)));
  const groups = new Map<PeriodKey, MediaItem[]>(periods.map((p) => [p.key, []]));
  for (const item of items) {
    const date = item.release_date || item.first_air_date || "";
    const index = bounds.findIndex((bound) => date >= bound);
    const period = periods[index === -1 || !date ? periods.length - 1 : index];
    groups.get(period.key)!.push(item);
  }
  return [...groups].filter(([, list]) => list.length > 0);
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
  const { t, i18n } = useTranslation();
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [providerIds, setProviderIds] = useState<string[]>([]);
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
    : providerIds.length
      ? providerIds
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
  }, [genreIds, providerIds, useMyPlatforms, country, language, windowDays]);

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
    country,
    language,
    windowDays,
    i18n.language,
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
    providerIds,
    useMyPlatforms,
    favoriteProviderIds,
    region,
    country,
    language,
    windowDays,
    i18n.language,
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

  useScrollRestoration(status === "success", results.length);

  const groups = useMemo(() => groupByPeriod(results, windowDays), [results, windowDays]);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={t("newReleasesPage.eyebrow")}
        title={t("newReleasesPage.title")}
        lead={t("newReleasesPage.lead")}
        spot
      />

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
        countryLanguage={{ country, setCountry, language, setLanguage }}
        periods={{
          label: t("newReleasesPage.windowsLabel"),
          options: WINDOWS.map((w) => ({
            value: w.value,
            label: t(`newReleasesPage.windows.${w.key}`),
          })),
          value: windowDays,
          onChange: setWindowDays,
        }}
      />

      {status === "loading" && (
        <div className={gridStyles.grid}>
          {Array.from({ length: GRID_SKELETON_COUNT }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      )}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "success" && results.length === 0 && (
        <EmptyState label={t("newReleasesPage.emptyState")} />
      )}

      {status === "success" && results.length > 0 && (
        <>
          {groups.map(([key, items]) => (
            <section key={key} className={styles.period} aria-labelledby={`period-${key}`}>
              <h2 id={`period-${key}`} className={styles.periodTitle}>
                {t(`newReleasesPage.periods.${key}`)}{" "}
                <span className={styles.count}>
                  {t("newReleasesPage.titlesCount", { count: items.length })}
                </span>
              </h2>
              <div className={gridStyles.grid}>
                {items.map((item) => (
                  <MediaCard key={item.id} item={item} showProviderBadge />
                ))}
              </div>
            </section>
          ))}
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
