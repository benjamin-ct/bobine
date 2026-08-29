import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getGenres,
  getDetails,
  estimateRuntimeMinutes,
  posterUrl,
} from "../../../core/api/tmdb.ts";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { DonutChart } from "../../../shared/components/index.ts";
import { posterAccentFromGenres } from "../../../shared/lib/posterAccent.ts";
import posterStyles from "../../../shared/styles/posterAccents.module.css";
import type { LibraryItem } from "../../../core/types/library.ts";
import type { MediaType } from "../../../core/types/tmdb.ts";
import styles from "./StatsPanel.module.css";

const RECENT_COUNT = 8;
const TOP_GENRES_COUNT = 6;
const TOP_YEARS_COUNT = 5;
const MAX_BACKFILL_PER_VISIT = 20;

// Palette catégorielle validée (skill dataviz, slots 1 & 2 — colorblind-safe).
const DONUT_COLORS = { movie: "#3987e5", tv: "#d95926" };

function makeKey(mediaType: MediaType, id: number): string {
  return `${mediaType}:${id}`;
}

function extractDirectors(details: Awaited<ReturnType<typeof getDetails>>, mediaType: MediaType) {
  const people =
    mediaType === "movie"
      ? (details.credits?.crew || []).filter((c) => c.job === "Director")
      : details.created_by || [];
  return people.map((p) => ({ id: p.id, name: p.name })).filter((p) => p.id && p.name);
}

export default function StatsPanel({ watched }: { watched: LibraryItem[] }) {
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});
  // Distingue "pas encore chargé" de "chargé, ce genre est introuvable" : sans
  // ça, `topGenres` retombe sur "…" le temps du premier fetch — un nom de
  // genre littéralement "…" se lit comme un bug plutôt que comme du
  // chargement (voir le ticket Trello "Genres préférés '...'").
  const [genresLoaded, setGenresLoaded] = useState(false);
  const { setRuntime, setDirectors } = useLibrary();
  const attemptedRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    Promise.all([getGenres("movie"), getGenres("tv")])
      .then(([m, t]) => {
        if (cancelled) {
          return;
        }
        const map: Record<number, string> = {};
        for (const g of [...(m.genres || []), ...(t.genres || [])]) {
          map[g.id] = g.name;
        }
        setGenreMap(map);
        setGenresLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setGenresLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Complète en tâche de fond la durée ET les réalisateur·rices des titres
  // marqués vus qui n'ont pas encore l'une ou l'autre.
  useEffect(() => {
    const toFetch = watched
      .filter(
        (item) =>
          (item.runtimeMinutes == null || !item.directors?.length) &&
          !attemptedRef.current.has(makeKey(item.mediaType, item.id))
      )
      .slice(0, MAX_BACKFILL_PER_VISIT);
    if (toFetch.length === 0) {
      return;
    }
    toFetch.forEach((item) => {
      attemptedRef.current.add(makeKey(item.mediaType, item.id));
      getDetails(item.mediaType, item.id)
        .then((details) => {
          if (item.runtimeMinutes == null) {
            const minutes = estimateRuntimeMinutes(details, item.mediaType);
            if (minutes) {
              setRuntime(item.mediaType, item.id, minutes);
            }
          }
          if (!item.directors?.length) {
            const directors = extractDirectors(details, item.mediaType);
            if (directors.length) {
              setDirectors(item.mediaType, item.id, directors);
            }
          }
        })
        .catch(() => {});
    });
  }, [watched, setRuntime, setDirectors]);

  if (watched.length === 0) {
    return null;
  }

  const movieCount = watched.filter((w) => w.mediaType === "movie").length;
  const seriesCount = watched.length - movieCount;
  const filmsPct = watched.length ? Math.round((movieCount / watched.length) * 100) : 0;

  const totalEpisodes = watched.reduce((sum, w) => sum + (w.watchedEpisodes?.length || 0), 0);
  const knownRuntimeItems = watched.filter((w) => w.runtimeMinutes != null);
  const totalMinutes = knownRuntimeItems.reduce((sum, item) => sum + (item.runtimeMinutes || 0), 0);
  const totalHours = Math.round(totalMinutes / 60);
  const totalDays = (totalMinutes / 1440).toFixed(1).replace(".", ",");

  const ratedItems = watched.filter((w) => w.rating != null);
  const averageRating = ratedItems.length
    ? ratedItems.reduce((sum, w) => sum + (w.rating || 0), 0) / ratedItems.length
    : null;

  const yearCounts = new Map<string, number>();
  for (const item of watched) {
    const year = new Date(item.addedAt).getFullYear().toString();
    yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
  }
  const years = [...yearCounts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, TOP_YEARS_COUNT);
  const maxYearCount = Math.max(1, ...years.map(([, n]) => n));

  const genreCounts = new Map<number, number>();
  for (const item of watched) {
    for (const gId of item.genreIds || []) {
      genreCounts.set(gId, (genreCounts.get(gId) || 0) + 1);
    }
  }
  // Filtre plutôt que de retomber sur un texte de repli : un id absent de
  // `genreMap` (chargement pas encore terminé, ou id TMDB inconnu) ne doit
  // jamais s'afficher comme un genre à part entière.
  const topGenres = [...genreCounts.entries()]
    .filter(([id]) => genreMap[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GENRES_COUNT)
    .map(([id, n]) => ({ id, name: genreMap[id], n }));

  const recent = watched.slice(0, RECENT_COUNT);

  return (
    <div className={styles.grid}>
      <div className={`${styles.ticket} ${styles.span5}`}>
        <span className={styles.k}>Répartition</span>
        <div className={styles.donutRow}>
          <DonutChart
            centerValue={watched.length}
            centerLabel="vus"
            segments={[
              { label: "Films", value: movieCount, color: DONUT_COLORS.movie },
              { label: "Séries", value: seriesCount, color: DONUT_COLORS.tv },
            ]}
          />
        </div>
        <p className={styles.hint}>
          {movieCount} film{movieCount > 1 ? "s" : ""} ({filmsPct}%) · {seriesCount} série
          {seriesCount > 1 ? "s" : ""} ({100 - filmsPct}%)
        </p>
      </div>

      <div className={`${styles.ticket} ${styles.span4}`}>
        <span className={styles.k}>Temps de visionnage</span>
        <div className={styles.bigNum}>
          {totalHours} <span className={styles.unit}>heures</span>
        </div>
        <p className={styles.hint}>
          ≈ {totalDays} jours · {totalEpisodes} épisode{totalEpisodes > 1 ? "s" : ""} de série
          {knownRuntimeItems.length < watched.length ? " (estimation en cours de complétion)" : ""}
        </p>
      </div>

      <div className={`${styles.ticket} ${styles.span3}`}>
        <span className={styles.k}>Note moyenne</span>
        <div className={styles.bigNum}>
          {averageRating != null ? averageRating.toFixed(1).replace(".", ",") : "—"}
          <span className={styles.unit}>/10</span>
        </div>
        <p className={styles.hint}>
          sur {ratedItems.length} titre{ratedItems.length > 1 ? "s" : ""} noté
          {ratedItems.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className={`${styles.ticket} ${styles.span7}`}>
        <span className={styles.k}>Vus par année</span>
        <div className={styles.bars}>
          {years.length ? (
            years.map(([year, n]) => (
              <div key={year} className={styles.barRow}>
                <span>{year}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${Math.round((n / maxYearCount) * 100)}%` }}
                  />
                </div>
                <span className={styles.barValue}>{n}</span>
              </div>
            ))
          ) : (
            <p className={styles.hint}>Aucune donnée pour l'instant.</p>
          )}
        </div>
      </div>

      <div className={`${styles.ticket} ${styles.span5}`}>
        <span className={styles.k}>Genres préférés</span>
        <div className={styles.genreTags}>
          {!genresLoaded ? (
            <p className={styles.hint}>Chargement…</p>
          ) : topGenres.length ? (
            topGenres.map((g) => (
              <span key={g.id} className={styles.gtag}>
                {g.name} <span className={styles.gtagN}>{g.n}</span>
              </span>
            ))
          ) : (
            <p className={styles.hint}>Aucun genre pour l'instant.</p>
          )}
        </div>
      </div>

      <div className={`${styles.ticket} ${styles.span12}`}>
        <span className={styles.k}>Vus récemment</span>
        <div className={styles.recentRow}>
          {recent.map((item) => {
            const accentKey = posterAccentFromGenres(item.genreIds, `${item.mediaType}:${item.id}`);
            return (
              <Link
                key={`${item.mediaType}:${item.id}`}
                to={`/media/${item.mediaType}/${item.id}`}
                className={styles.recentItem}
                title={item.title}
              >
                {item.posterPath ? (
                  <img src={posterUrl(item.posterPath, "w185") ?? undefined} alt={item.title} />
                ) : (
                  <div className={`${styles.recentEmpty} ${posterStyles[accentKey]}`} />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
