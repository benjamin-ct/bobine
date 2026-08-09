import { useEffect, useState } from "react";
import { getGenres } from "../api/tmdb";

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
    .slice(0, 3)
    .map(([id, count]) => `${genreMap[id] || "…"} (${count})`);

  return (
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
  );
}
