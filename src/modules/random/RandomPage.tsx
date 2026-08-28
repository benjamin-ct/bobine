import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  discover,
  getGenres,
  getWatchProvidersList,
  getDetails,
  getWatchProviders,
  posterUrl,
  formatFullDate,
} from "../../core/api/tmdb.ts";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useFavoriteProviders } from "../../core/context/FavoriteProvidersContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import {
  FilterBar,
  ProviderBadges,
  TrailerButton,
  ErrorMessage,
  PageHeader,
} from "../../shared/components/index.ts";
import { posterAccentFromGenres } from "../../shared/lib/posterAccent.ts";
import posterStyles from "../../shared/styles/posterAccents.module.css";
import { ratingTier } from "../../shared/lib/ratingTier.ts";
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

export default function RandomPage() {
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [providerId, setProviderId] = useState("");
  const [useMyPlatforms, setUseMyPlatforms] = useState(false);
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [providers, setProviders] = useState<WatchProviderOption[]>([]);
  const [excludeWatched, setExcludeWatched] = useState(true);

  const [pick, setPick] = useState<MediaItem | null>(null);
  const [pickDetails, setPickDetails] = useState<MediaDetails | null>(null);
  const [providersResult, setProvidersResult] = useState<RegionWatchProviders | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "success" | "error">("idle");
  const [error, setError] = useState<Error | null>(null);

  const { watchedIds, isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useLibrary();
  const { region } = useRegion();
  const { favoriteProviderIds } = useFavoriteProviders();
  const { excludedGenreIds } = useExcludedGenres();
  const { filterExcluded } = useExcludedTitles();

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

  async function drawRandom() {
    setStatus("loading");
    setError(null);
    setPick(null);
    setPickDetails(null);
    try {
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

      const [fullDetails, providersData] = await Promise.all([
        getDetails(mediaType, candidate.id),
        getWatchProviders(mediaType, candidate.id, region),
      ]);
      setPick(candidate);
      setPickDetails(fullDetails);
      setProvidersResult(providersData);
      setStatus("success");
    } catch (err) {
      setError(err as Error);
      setStatus("error");
    }
  }

  const title = pick?.title || pick?.name || "";
  const date = pick?.release_date || pick?.first_air_date;
  const watched = pick ? isWatched(mediaType, pick.id) : false;
  const inWatchlist = pick ? isInWatchlist(mediaType, pick.id) : false;
  const accentKey = pick
    ? posterAccentFromGenres(pick.genre_ids, `${mediaType}:${pick.id}`)
    : "drama";
  const tier = pick?.vote_average != null ? ratingTier(pick.vote_average) : null;

  function buildLibItem() {
    if (!pick) {
      return null;
    }
    return {
      id: pick.id,
      mediaType,
      title,
      posterPath: pick.poster_path ?? null,
      date,
      genreIds: pick.genre_ids || [],
    };
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Vous ne savez pas quoi regarder ?"
        title="La roue de la bobine"
        lead="Un tirage au sort dans votre univers. Relancez jusqu'à trouver la perle du soir."
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

      <div className={styles.yearFilter}>
        <label>Année de sortie</label>
        <div className={styles.range}>
          <input
            type="number"
            placeholder="Min"
            min={1900}
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
          />
          <span>–</span>
          <input
            type="number"
            placeholder="Max"
            min={1900}
            value={yearMax}
            onChange={(e) => setYearMax(e.target.value)}
          />
        </div>
      </div>

      <label className={styles.checkboxLine}>
        <input
          type="checkbox"
          checked={excludeWatched}
          onChange={(e) => setExcludeWatched(e.target.checked)}
        />
        Exclure ce que j'ai déjà vu
      </label>

      <button
        type="button"
        className={styles.rollBtn}
        onClick={drawRandom}
        disabled={status === "loading"}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        {status === "loading" ? "Tirage en cours…" : pick ? "Relancer le tirage" : "Tirer un titre"}
      </button>

      {status === "error" && <ErrorMessage error={error} />}
      {status === "empty" && (
        <p className={styles.hint}>Aucun titre ne correspond à ces filtres.</p>
      )}

      {pick && (
        <div className={`${styles.spotlight} ${posterStyles[accentKey]}`}>
          <div className={styles.posterWrap}>
            {pick.poster_path ? (
              <img src={posterUrl(pick.poster_path, "w342") ?? undefined} alt={title} />
            ) : (
              <div className={`${styles.posterEmpty} ${posterStyles[accentKey]}`}>{title}</div>
            )}
          </div>
          <div>
            <p className={styles.badge}>Tirage du soir</p>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.meta}>
              {date ? formatFullDate(date) || date.slice(0, 4) : "—"}
              {pickDetails?.genres?.length
                ? ` · ${pickDetails.genres.map((g) => g.name).join(", ")}`
                : ""}
              {tier && pick.vote_average != null ? ` · ⭐ ${pick.vote_average.toFixed(1)}` : ""}
            </p>
            <p className={styles.overview}>{pick.overview}</p>
            <div className={styles.actions}>
              <Link to={`/media/${mediaType}/${pick.id}`} className={styles.primaryBtn}>
                Voir la fiche
              </Link>
              <button
                type="button"
                className={`${styles.secondaryBtn} ${inWatchlist ? styles.on : ""}`}
                onClick={() => {
                  const item = buildLibItem();
                  if (item) {
                    toggleWatchlist(item);
                  }
                }}
              >
                {inWatchlist ? "★ Envie de voir" : "☆ Envie de voir"}
              </button>
              <button
                type="button"
                className={`${styles.secondaryBtn} ${watched ? styles.on : ""}`}
                onClick={() => {
                  const item = buildLibItem();
                  if (item) {
                    toggleWatched(item);
                  }
                }}
              >
                {watched ? "✔ Déjà vu" : "○ Marquer comme vu"}
              </button>
              <TrailerButton videos={pickDetails?.videos?.results} />
              <Link
                to={`/media/${mediaType}/${pick.id}#recommendations`}
                className={styles.secondaryBtn}
              >
                🔁 Similaire
              </Link>
            </div>
            <h3 className={styles.whereTitle}>Où regarder</h3>
            <ProviderBadges providers={providersResult} />
          </div>
        </div>
      )}
    </div>
  );
}
