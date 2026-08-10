import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getGenres, getDetails, estimateRuntimeMinutes, posterUrl } from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";

const RECENT_COUNT = 6;
const TOP_GENRES_COUNT = 5;
// Évite de partir en rafale sur des dizaines de requêtes si l'historique est
// long ; le reste se complète tout seul aux prochaines visites de la page.
const MAX_BACKFILL_PER_VISIT = 20;

function makeKey(mediaType, id) {
  return `${mediaType}:${id}`;
}

function formatWatchTime(totalMinutes) {
  const hours = totalMinutes / 60;
  const days = hours / 24;
  const months = days / 30.44;
  const parts = [`${Math.round(hours)} h`];
  if (days >= 1) parts.push(`${days.toFixed(1)} j`);
  if (months >= 1) parts.push(`${months.toFixed(2)} mois`);
  return parts.join(" · ");
}

export default function Stats({ watched }) {
  const [genreMap, setGenreMap] = useState({});
  const { setRuntime } = useLibrary();
  const attemptedRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([getGenres("movie"), getGenres("tv")])
      .then(([m, t]) => {
        if (cancelled) return;
        const map = {};
        for (const g of [...(m.genres || []), ...(t.genres || [])]) map[g.id] = g.name;
        setGenreMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Complète en tâche de fond la durée des titres marqués vus avant qu'on ne
  // la capture (ancienne entrée, ou ajoutée depuis une carte sans détails
  // complets). `attemptedRef` (et non un flag "cancelled" lié au cleanup de
  // l'effet) évite les doublons : setRuntime met à jour LibraryProvider, qui
  // reste monté même si Stats disparaît entre-temps, donc rien à annuler.
  useEffect(() => {
    const toFetch = watched
      .filter((item) => item.runtimeMinutes == null && !attemptedRef.current.has(makeKey(item.mediaType, item.id)))
      .slice(0, MAX_BACKFILL_PER_VISIT);
    if (toFetch.length === 0) return;

    toFetch.forEach((item) => {
      attemptedRef.current.add(makeKey(item.mediaType, item.id));
      getDetails(item.mediaType, item.id)
        .then((details) => {
          const minutes = estimateRuntimeMinutes(details, item.mediaType);
          if (minutes) setRuntime(item.mediaType, item.id, minutes);
        })
        .catch(() => {});
    });
  }, [watched, setRuntime]);

  if (watched.length === 0) return null;

  const movieCount = watched.filter((w) => w.mediaType === "movie").length;
  const seriesCount = watched.length - movieCount;

  const genreCounts = {};
  for (const item of watched) {
    for (const gid of item.genreIds || []) {
      genreCounts[gid] = (genreCounts[gid] || 0) + 1;
    }
  }
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GENRES_COUNT)
    .map(([id, count]) => `${genreMap[id] || "…"} (${count})`);

  const knownRuntimeItems = watched.filter((w) => w.runtimeMinutes != null);
  const totalMinutes = knownRuntimeItems.reduce((sum, item) => sum + item.runtimeMinutes, 0);
  const missingRuntimeCount = watched.length - knownRuntimeItems.length;

  // `watched` est déjà trié du plus récent au plus ancien (voir LibraryContext).
  const recent = watched.slice(0, RECENT_COUNT);

  return (
    <div className="stats-section">
      <div className="stats-panel">
        <div className="stat-tile">
          <span className="stat-tile__value">{watched.length}</span>
          <span className="stat-tile__label">Titres vus</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__value">{movieCount}</span>
          <span className="stat-tile__label">Films</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__value">{seriesCount}</span>
          <span className="stat-tile__label">Séries</span>
        </div>
        {topGenres.length > 0 && (
          <div className="stat-tile stat-tile--wide">
            <span className="stat-tile__label">Genres préférés</span>
            <span className="stat-tile__value stat-tile__value--small">{topGenres.join(" · ")}</span>
          </div>
        )}
        {totalMinutes > 0 && (
          <div className="stat-tile stat-tile--wide">
            <span className="stat-tile__label">
              Temps de visionnage{mediaAndSeriesNote(movieCount, seriesCount)}
              {missingRuntimeCount > 0 ? ` · estimation sur ${knownRuntimeItems.length}/${watched.length} titres` : ""}
            </span>
            <span className="stat-tile__value stat-tile__value--small">{formatWatchTime(totalMinutes)}</span>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="stats-recent">
          <p className="stats-recent__label">Vus récemment</p>
          <div className="stats-recent__row">
            {recent.map((item) => (
              <Link
                key={`${item.mediaType}:${item.id}`}
                to={`/media/${item.mediaType}/${item.id}`}
                className="stats-recent__item"
                title={item.title}
              >
                {item.posterPath ? (
                  <img src={posterUrl(item.posterPath, "w92")} alt={item.title} />
                ) : (
                  <div className="stats-recent__no-poster" />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Pour les séries, le temps est une estimation (durée moyenne d'un épisode ×
// nombre d'épisodes) puisque Bobine ne suit pas le visionnage épisode par
// épisode — seulement "vu" au niveau de la série entière.
function mediaAndSeriesNote(movieCount, seriesCount) {
  return seriesCount > 0 ? (movieCount > 0 ? " (séries estimées)" : " (estimé)") : "";
}
