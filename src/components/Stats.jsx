import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getGenres, posterUrl } from "../api/tmdb";

const RECENT_COUNT = 6;
const TOP_GENRES_COUNT = 5;

export default function Stats({ watched }) {
  const [genreMap, setGenreMap] = useState({});

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
