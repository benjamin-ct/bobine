import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getGenres, getDetails, estimateRuntimeMinutes, posterUrl } from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";
import DonutChart from "./DonutChart";

const RECENT_COUNT = 6;
const TOP_GENRES_COUNT = 5;
const TOP_DIRECTORS_COUNT = 5;
// Un réalisateur/créateur n'est "récurrent" que s'il revient plus d'une fois.
const MIN_DIRECTOR_OCCURRENCES = 2;
// Évite de partir en rafale sur des dizaines de requêtes si l'historique est
// long ; le reste se complète tout seul aux prochaines visites de la page.
const MAX_BACKFILL_PER_VISIT = 20;

// Palette catégorielle validée (skill dataviz, slots 1 & 2 — colorblind-safe,
// contraste ≥3:1 sur le fond des cartes) : bleu / orange.
const DONUT_COLORS = { movie: "#3987e5", tv: "#d95926" };

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

// Films : le·s réalisateur·rices sont dans credits.crew. Séries : TMDB les
// expose directement via created_by (même logique que Detail.jsx).
function extractDirectors(details, mediaType) {
  const people =
    mediaType === "movie"
      ? (details.credits?.crew || []).filter((c) => c.job === "Director")
      : details.created_by || [];
  return people.map((p) => ({ id: p.id, name: p.name })).filter((p) => p.id && p.name);
}

export default function Stats({ watched }) {
  const [genreMap, setGenreMap] = useState({});
  const { setRuntime, setDirectors } = useLibrary();
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

  // Complète en tâche de fond la durée ET les réalisateur·rices des titres
  // marqués vus qui n'ont pas encore l'une ou l'autre — un seul appel
  // getDetails() par item couvre les deux (il renvoie déjà credits), pas
  // besoin de deux passes séparées qui doubleraient les requêtes réseau.
  // `attemptedRef` (et non un flag "cancelled" lié au cleanup de l'effet)
  // évite les doublons : setRuntime/setDirectors mettent à jour
  // LibraryProvider, qui reste monté même si Stats disparaît entre-temps,
  // donc rien à annuler.
  useEffect(() => {
    const toFetch = watched
      .filter(
        (item) =>
          (item.runtimeMinutes == null || !item.directors?.length) &&
          !attemptedRef.current.has(makeKey(item.mediaType, item.id))
      )
      .slice(0, MAX_BACKFILL_PER_VISIT);
    if (toFetch.length === 0) return;

    toFetch.forEach((item) => {
      attemptedRef.current.add(makeKey(item.mediaType, item.id));
      getDetails(item.mediaType, item.id)
        .then((details) => {
          if (item.runtimeMinutes == null) {
            const minutes = estimateRuntimeMinutes(details, item.mediaType);
            if (minutes) setRuntime(item.mediaType, item.id, minutes);
          }
          if (!item.directors?.length) {
            const directors = extractDirectors(details, item.mediaType);
            if (directors.length) setDirectors(item.mediaType, item.id, directors);
          }
        })
        .catch(() => {});
    });
  }, [watched, setRuntime, setDirectors]);

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

  // Réalisateur·rices/créateur·rices revenant sur plusieurs titres vus (voir
  // extractDirectors + le backfill ci-dessus). Compté par id (pas par nom :
  // évite de confondre deux personnes homonymes).
  const directorCounts = new Map();
  for (const item of watched) {
    for (const d of item.directors || []) {
      const entry = directorCounts.get(d.id) || { name: d.name, count: 0 };
      entry.count += 1;
      directorCounts.set(d.id, entry);
    }
  }
  const recurringDirectors = [...directorCounts.values()]
    .filter((d) => d.count >= MIN_DIRECTOR_OCCURRENCES)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_DIRECTORS_COUNT);

  const knownRuntimeItems = watched.filter((w) => w.runtimeMinutes != null);
  const totalMinutes = knownRuntimeItems.reduce((sum, item) => sum + item.runtimeMinutes, 0);
  const missingRuntimeCount = watched.length - knownRuntimeItems.length;

  const ratedItems = watched.filter((w) => w.rating != null);
  const averageRating = ratedItems.length
    ? ratedItems.reduce((sum, w) => sum + w.rating, 0) / ratedItems.length
    : null;

  // Année où le titre a été marqué vu (addedAt), pas son année de sortie —
  // c'est un journal d'activité personnel ("qu'est-ce que j'ai regardé en
  // 2024 ?"), pas une répartition du catalogue par date de sortie.
  const yearCounts = {};
  for (const item of watched) {
    const year = new Date(item.addedAt).getFullYear();
    if (Number.isFinite(year)) yearCounts[year] = (yearCounts[year] || 0) + 1;
  }
  const yearsSorted = Object.entries(yearCounts).sort((a, b) => Number(b[0]) - Number(a[0]));
  const maxYearCount = Math.max(1, ...yearsSorted.map(([, count]) => count));

  // `watched` est déjà trié du plus récent au plus ancien (voir LibraryContext).
  const recent = watched.slice(0, RECENT_COUNT);

  return (
    <div className="stats-section">
      <div className="stats-hero-row">
        <div className="stats-hero-card">
          <DonutChart
            centerValue={watched.length}
            centerLabel="vus"
            segments={[
              { label: "Films", value: movieCount, color: DONUT_COLORS.movie },
              { label: "Séries", value: seriesCount, color: DONUT_COLORS.tv },
            ]}
          />
        </div>

        {totalMinutes > 0 && (
          <div className="stats-hero-card stats-hero-card--time">
            <span className="stats-hero-card__label">
              Temps de visionnage total{mediaAndSeriesNote(movieCount, seriesCount)}
            </span>
            <span className="stats-hero-figure">{formatWatchTime(totalMinutes)}</span>
            {missingRuntimeCount > 0 && (
              <span className="stats-hero-card__note">
                Estimation sur {knownRuntimeItems.length}/{watched.length} titres (le reste se complète tout seul)
              </span>
            )}
          </div>
        )}
      </div>

      {(topGenres.length > 0 || recurringDirectors.length > 0 || averageRating != null) && (
        <div className="stats-panel">
          {topGenres.length > 0 && (
            <div className="stat-tile stat-tile--wide">
              <span className="stat-tile__label">Genres préférés</span>
              <span className="stat-tile__value stat-tile__value--small">{topGenres.join(" · ")}</span>
            </div>
          )}

          {recurringDirectors.length > 0 && (
            <div className="stat-tile stat-tile--wide">
              <span className="stat-tile__label">Réalisateurs récurrents</span>
              <span className="stat-tile__value stat-tile__value--small">
                {recurringDirectors.map((d) => `${d.name} (${d.count})`).join(" · ")}
              </span>
            </div>
          )}

          {averageRating != null && (
            <div className="stat-tile">
              <span className="stat-tile__label">Note moyenne donnée</span>
              <span className="stat-tile__value">{averageRating.toFixed(1)}/10</span>
            </div>
          )}
        </div>
      )}

      {yearsSorted.length > 0 && (
        <div className="stats-years">
          <p className="stats-years__label">Vus par année</p>
          {yearsSorted.map(([year, count]) => (
            <div key={year} className="stats-years__row">
              <span className="stats-years__year">{year}</span>
              <div className="stats-years__bar-track">
                <div className="stats-years__bar" style={{ width: `${(count / maxYearCount) * 100}%` }} />
              </div>
              <span className="stats-years__count">{count}</span>
            </div>
          ))}
        </div>
      )}

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
