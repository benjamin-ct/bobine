import { useEffect, useId, useState } from "react";
import type { FocusEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  discover,
  getGenres,
  getWatchProvidersList,
  getDetails,
  watchProvidersFromDetails,
  posterUrl,
  formatFullDate,
} from "../../core/api/tmdb.ts";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useLocale } from "../../core/context/LocaleContext.tsx";
import { useFavoriteProviders } from "../../core/context/FavoriteProvidersContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import {
  FilterBar,
  ProviderBadges,
  TrailerButton,
  ErrorMessage,
  PageHeader,
  Icon,
  Chip,
} from "../../shared/components/index.ts";
import { posterAccentFromGenres } from "../../shared/lib/posterAccent.ts";
import posterStyles from "../../shared/styles/posterAccents.module.css";
import { ratingTier } from "../../shared/lib/ratingTier.ts";
import { clampNumericValue, isRangeInverted } from "../../shared/lib/numericRangeFilter.ts";
import type { LibraryItem } from "../../core/types/library.ts";
import type {
  Genre,
  MediaDetails,
  MediaItem,
  MediaType,
  RegionWatchProviders,
} from "../../core/types/tmdb.ts";
import type { WatchProviderOption } from "../../core/api/tmdb.ts";
import styles from "./RandomPage.module.css";

const MAX_ATTEMPTS = 6;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MIN = 1900;
const YEAR_MAX = CURRENT_YEAR + 5;

type DrawSource = "watchlist" | "catalog";

// Historique des tirages : propre à l'onglet (sessionStorage), les plus
// récents en premier.
const HISTORY_STORAGE_KEY = "seancy.randomHistory.v1";
const HISTORY_MAX = 12;

interface HistoryEntry {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hasAnyProvider(providers: RegionWatchProviders | null, ids: string[]): boolean {
  if (!providers) {
    return false;
  }
  const available = [
    ...(providers.flatrate || []),
    ...(providers.rent || []),
    ...(providers.buy || []),
  ].map((p) => String(p.provider_id));
  return ids.some((id) => available.includes(id));
}

export default function RandomPage() {
  const { t } = useTranslation();
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [providerId, setProviderId] = useState("");
  const [useMyPlatforms, setUseMyPlatforms] = useState(false);
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [providers, setProviders] = useState<WatchProviderOption[]>([]);
  const [excludeWatched, setExcludeWatched] = useState(true);
  const [chosenSource, setChosenSource] = useState<DrawSource | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const filtersId = useId();

  const [pick, setPick] = useState<MediaItem | null>(null);
  const [pickDetails, setPickDetails] = useState<MediaDetails | null>(null);
  const [providersResult, setProvidersResult] = useState<RegionWatchProviders | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "empty" | "success" | "error" | "invalid"
  >("idle");
  const [error, setError] = useState<Error | null>(null);

  const { watchlist, watchedIds, isWatched, isInWatchlist, toggleWatched, toggleWatchlist } =
    useLibrary();
  // Par défaut « Mes envies de voir » ; tout le catalogue tant que la liste
  // est vide (visiteur, nouveau compte), sauf choix explicite.
  const source: DrawSource = chosenSource ?? (watchlist.length > 0 ? "watchlist" : "catalog");
  const { region, regionName } = useRegion();
  const { locale } = useLocale();
  const { favoriteProviderIds } = useFavoriteProviders();
  const { excludedGenreIds } = useExcludedGenres();
  const { filterExcluded } = useExcludedTitles();

  const yearRangeError = isRangeInverted(yearMin, yearMax)
    ? t("advancedFilters.yearRangeError")
    : null;

  // Plafonne la valeur saisie une fois le champ quitté (pas à chaque frappe,
  // ce qui empêcherait de taper un nombre à plusieurs chiffres dès que sa
  // valeur intermédiaire sort des bornes, ex. "2" < 1900).
  function clampYearOnBlur(setter: (value: string) => void) {
    return (e: FocusEvent<HTMLInputElement>) => {
      const clamped = clampNumericValue(e.target.value, YEAR_MIN, YEAR_MAX);
      if (clamped !== e.target.value) {
        setter(clamped);
      }
    };
  }

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

  const activeProviderIds = useMyPlatforms
    ? favoriteProviderIds.map(String)
    : providerId
      ? [providerId]
      : [];
  const activeFiltersCount =
    (genreIds.length > 0 ? 1 : 0) +
    (activeProviderIds.length > 0 ? 1 : 0) +
    (yearMin || yearMax ? 1 : 0) +
    (source === "catalog" && !excludeWatched ? 1 : 0);

  function rememberDraw(item: MediaItem, details: MediaDetails) {
    const entry: HistoryEntry = {
      id: item.id,
      mediaType: item.mediaType,
      title: details.title || details.name || item.title || item.name || "",
      posterPath: details.poster_path ?? item.poster_path ?? null,
    };
    setHistory((prev) => {
      const next = [
        entry,
        ...prev.filter((h) => h.id !== entry.id || h.mediaType !== entry.mediaType),
      ].slice(0, HISTORY_MAX);
      try {
        sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Stockage indisponible (navigation privée...) : historique en mémoire.
      }
      return next;
    });
  }

  // Tirage dans « Mes envies de voir » : mêmes filtres que pour le catalogue
  // (type, genres, années), les plateformes étant vérifiées sur la fiche du
  // titre (disponibilités dans la région), faute d'information dans la liste.
  async function drawFromWatchlist(): Promise<{ item: MediaItem; details: MediaDetails } | null> {
    const min = yearMin ? Number(yearMin) : null;
    const max = yearMax ? Number(yearMax) : null;
    let pool = watchlist.filter((entry: LibraryItem) => {
      if (entry.mediaType !== mediaType) {
        return false;
      }
      if (genreIds.length > 0 && !genreIds.some((g) => entry.genreIds?.includes(g))) {
        return false;
      }
      const year = entry.date ? Number(entry.date.slice(0, 4)) : null;
      if ((min !== null || max !== null) && year === null) {
        return false;
      }
      return (min === null || year! >= min) && (max === null || year! <= max);
    });
    // Évite de retomber sur le titre affiché quand il y a d'autres choix.
    if (pool.length > 1 && pick) {
      pool = pool.filter((entry) => entry.id !== pick.id || entry.mediaType !== pick.mediaType);
    }
    const candidates = shuffle(pool).slice(0, activeProviderIds.length > 0 ? MAX_ATTEMPTS : 1);
    for (const entry of candidates) {
      const details = await getDetails(entry.mediaType, entry.id);
      if (
        activeProviderIds.length > 0 &&
        !hasAnyProvider(watchProvidersFromDetails(details, region), activeProviderIds)
      ) {
        continue;
      }
      return {
        item: {
          ...details,
          id: entry.id,
          mediaType: entry.mediaType,
          genre_ids: details.genres?.map((g) => g.id) ?? entry.genreIds,
        },
        details,
      };
    }
    return null;
  }

  async function drawRandom() {
    if (yearRangeError) {
      // Plage min/max incohérente : on n'appelle pas l'API, qui retomberait
      // silencieusement sur 0 résultat.
      setStatus("invalid");
      return;
    }
    setStatus("loading");
    setError(null);
    setPick(null);
    setPickDetails(null);
    try {
      if (source === "watchlist") {
        const drawn = await drawFromWatchlist();
        if (!drawn) {
          setStatus("empty");
          return;
        }
        setPick(drawn.item);
        setPickDetails(drawn.details);
        setProvidersResult(watchProvidersFromDetails(drawn.details, region));
        rememberDraw(drawn.item, drawn.details);
        setStatus("success");
        return;
      }
      const discoverParams = {
        genreId: genreIds,
        excludeGenreIds: excludedGenreIds,
        providerIds: useMyPlatforms ? favoriteProviderIds : providerId ? [providerId] : undefined,
        region,
        yearMin: yearMin ? Number(yearMin) : undefined,
        yearMax: yearMax ? Number(yearMax) : undefined,
      };
      const first = await discover(mediaType, { page: 1, ...discoverParams });
      const totalPages = Math.min(first.total_pages || 1, 500);
      if (totalPages === 0 || !first.results?.length) {
        setStatus("empty");
        return;
      }

      let candidate: MediaItem | null = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !candidate; attempt++) {
        const page = Math.max(1, Math.floor(Math.random() * Math.min(totalPages, 100)) + 1);
        const data = page === 1 ? first : await discover(mediaType, { page, ...discoverParams });
        let pool = filterExcluded(data.results, mediaType);
        if (excludeWatched) {
          pool = pool.filter((item) => !watchedIds.has(`${mediaType}:${item.id}`));
        }
        if (pool.length > 0) {
          candidate = { ...pool[Math.floor(Math.random() * pool.length)], mediaType };
        }
      }

      if (!candidate) {
        candidate = {
          ...first.results[Math.floor(Math.random() * first.results.length)],
          mediaType,
        };
      }

      const fullDetails = await getDetails(mediaType, candidate.id);
      setPick(candidate);
      setPickDetails(fullDetails);
      setProvidersResult(watchProvidersFromDetails(fullDetails, region));
      rememberDraw(candidate, fullDetails);
      setStatus("success");
    } catch (err) {
      setError(err as Error);
      setStatus("error");
    }
  }

  const title = pick?.title || pick?.name || "";
  const date = pick?.release_date || pick?.first_air_date;
  // Type du titre tiré (et non le filtre Films/Séries, qui peut avoir changé
  // depuis le tirage).
  const pickType = pick?.mediaType ?? mediaType;
  const watched = pick ? isWatched(pickType, pick.id) : false;
  const inWatchlist = pick ? isInWatchlist(pickType, pick.id) : false;
  const accentKey = pick
    ? posterAccentFromGenres(pick.genre_ids, `${pickType}:${pick.id}`)
    : "drama";
  const tier = pick?.vote_average != null ? ratingTier(pick.vote_average) : null;

  // Tirages précédents (le titre affiché n'y figure pas).
  const pastDraws = history.filter((h) => !pick || h.id !== pick.id || h.mediaType !== pickType);

  function buildLibItem() {
    if (!pick) {
      return null;
    }
    return {
      id: pick.id,
      mediaType: pickType,
      title,
      posterPath: pick.poster_path ?? null,
      date,
      genreIds: pick.genre_ids || [],
    };
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={t("randomPage.eyebrow")}
        title={t("randomPage.title")}
        lead={t("randomPage.lead")}
      />

      <div className={styles.sourceRow}>
        <span className={styles.sourceLabel} id={`${filtersId}-source`}>
          {t("randomPage.source")}
        </span>
        <div className={styles.sourceChips} role="group" aria-labelledby={`${filtersId}-source`}>
          <Chip active={source === "watchlist"} onClick={() => setChosenSource("watchlist")}>
            <Icon name="star" size={14} filled={source === "watchlist"} />
            {t("randomPage.sourceWatchlist")}
          </Chip>
          <Chip active={source === "catalog"} onClick={() => setChosenSource("catalog")}>
            <Icon name="grid" size={14} />
            {t("randomPage.sourceCatalog")}
          </Chip>
        </div>
      </div>

      <button
        type="button"
        className={styles.rollBtn}
        onClick={drawRandom}
        disabled={status === "loading" || !!yearRangeError}
      >
        <Icon name="shuffle" size={20} />
        {status === "loading"
          ? t("randomPage.rolling")
          : pick
            ? t("randomPage.reroll")
            : t("randomPage.draw")}
      </button>

      <div className={styles.filtersBar}>
        <button
          type="button"
          className={`${styles.filtersToggle} ${filtersOpen ? styles.filtersToggleOpen : ""}`}
          aria-expanded={filtersOpen}
          aria-controls={`${filtersId}-filters`}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {t("randomPage.filters")}
          {activeFiltersCount > 0 && <span className={styles.count}>{activeFiltersCount}</span>}
        </button>
      </div>

      <div id={`${filtersId}-filters`} className={styles.filters} hidden={!filtersOpen}>
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

        <div className={styles.yearFilter}>
          <label>{t("randomPage.releaseYear")}</label>
          <div className={styles.range}>
            <input
              type="number"
              inputMode="numeric"
              placeholder={t("advancedFilters.min")}
              min={YEAR_MIN}
              max={YEAR_MAX}
              value={yearMin}
              onChange={(e) => setYearMin(e.target.value)}
              onBlur={clampYearOnBlur(setYearMin)}
            />
            <span>–</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder={t("advancedFilters.max")}
              min={YEAR_MIN}
              max={YEAR_MAX}
              value={yearMax}
              onChange={(e) => setYearMax(e.target.value)}
              onBlur={clampYearOnBlur(setYearMax)}
            />
          </div>
        </div>

        {source === "catalog" && (
          <label className={styles.checkboxLine}>
            <input
              type="checkbox"
              checked={excludeWatched}
              onChange={(e) => setExcludeWatched(e.target.checked)}
            />
            {t("randomPage.excludeWatched")}
          </label>
        )}
      </div>

      {yearRangeError && (
        <p className={styles.rangeError} role="alert">
          <Icon name="alert" /> {yearRangeError}
        </p>
      )}

      {status === "error" && <ErrorMessage error={error} />}
      {status === "empty" && source === "catalog" && (
        <p className={styles.hint}>{t("randomPage.emptyHint")}</p>
      )}
      {status === "empty" && source === "watchlist" && (
        <p className={styles.hint}>
          {t("randomPage.emptyWatchlistHint")}{" "}
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              setChosenSource("catalog");
              setStatus("idle");
            }}
          >
            {t("randomPage.drawFromCatalog")}
          </button>
        </p>
      )}

      {pick && (
        <div className={styles.spotlight}>
          <div className={styles.posterWrap}>
            {pick.poster_path ? (
              <img src={posterUrl(pick.poster_path, "w342") ?? undefined} alt={title} />
            ) : (
              <div className={`${styles.posterEmpty} ${posterStyles[accentKey]}`}>{title}</div>
            )}
          </div>
          <div>
            <p className={styles.badge}>{t("randomPage.badge")}</p>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.meta}>
              {date ? formatFullDate(date, locale) || date.slice(0, 4) : "—"}
              {pickDetails?.genres?.length
                ? ` · ${pickDetails.genres.map((g) => g.name).join(", ")}`
                : ""}
              {tier && pick.vote_average != null && (
                <>
                  {" · "}
                  <Icon name="star" filled /> {pick.vote_average.toFixed(1)}
                </>
              )}
            </p>
            <p className={styles.overview}>{pick.overview}</p>
            <div className={styles.actions}>
              <Link to={`/media/${pickType}/${pick.id}`} className={styles.primaryBtn}>
                {t("randomPage.viewSheet")}
              </Link>
              <button
                type="button"
                className={`${styles.secondaryBtn} ${inWatchlist ? styles.onWant : ""}`}
                onClick={() => {
                  const item = buildLibItem();
                  if (item) {
                    toggleWatchlist(item);
                  }
                }}
              >
                <Icon name="star" filled={inWatchlist} />
                {inWatchlist ? t("randomPage.wantToWatchOn") : t("randomPage.wantToWatchOff")}
              </button>
              <button
                type="button"
                className={`${styles.secondaryBtn} ${watched ? styles.onWatched : ""}`}
                onClick={() => {
                  const item = buildLibItem();
                  if (item) {
                    toggleWatched(item);
                  }
                }}
              >
                <Icon name="check" strokeWidth={watched ? 3 : 2} />
                {watched ? t("randomPage.watchedOn") : t("randomPage.watchedOff")}
              </button>
              <TrailerButton videos={pickDetails?.videos?.results} />
              <Link
                to={`/media/${pickType}/${pick.id}#recommendations`}
                className={styles.secondaryBtn}
              >
                <Icon name="repeat" />
                {t("randomPage.similar")}
              </Link>
            </div>
            <h3 className={styles.whereTitle}>{t("randomPage.whereToWatch")}</h3>
            <ProviderBadges providers={providersResult} regionName={regionName} />
          </div>
        </div>
      )}

      {pastDraws.length > 0 && (
        <section className={styles.history} aria-labelledby={`${filtersId}-history`}>
          <h2 id={`${filtersId}-history`} className={styles.historyTitle}>
            {t("randomPage.historyTitle")}{" "}
            <span className={styles.historyMeta}>
              {t("randomPage.historyCount", { count: pastDraws.length })}
            </span>
          </h2>
          <ul className={styles.historyList}>
            {pastDraws.map((entry) => (
              <li key={`${entry.mediaType}:${entry.id}`}>
                <Link to={`/media/${entry.mediaType}/${entry.id}`} className={styles.historyItem}>
                  <span className={styles.historyPoster}>
                    {entry.posterPath && (
                      <img
                        src={posterUrl(entry.posterPath, "w154") ?? undefined}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </span>
                  <span className={styles.historyName}>{entry.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
