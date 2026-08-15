import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { posterUrl, getFrenchTheatricalDate, theatricalStatusFromDate } from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";

const THEATRICAL_BADGES = {
  in_theaters: "🎬 En salles",
  upcoming: "🗓️ Bientôt au cinéma",
};

export default function MediaCard({ item }) {
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useLibrary();
  const mediaType = item.mediaType || item.media_type;
  const title = item.title || item.name;
  const date = item.release_date || item.first_air_date;
  const year = date ? date.slice(0, 4) : "—";
  const watched = isWatched(mediaType, item.id);
  const inWatchlist = isInWatchlist(mediaType, item.id);

  // Statut "au cinéma" (France) : uniquement pour les films (les séries
  // n'ont pas de notion de sortie en salle).
  const [theatricalStatus, setTheatricalStatus] = useState(null);
  useEffect(() => {
    if (mediaType !== "movie") return;
    let cancelled = false;
    getFrenchTheatricalDate(item.id).then((theatricalDate) => {
      if (!cancelled) setTheatricalStatus(theatricalStatusFromDate(theatricalDate));
    });
    return () => {
      cancelled = true;
    };
  }, [mediaType, item.id]);

  const libItem = {
    id: item.id,
    mediaType,
    title,
    posterPath: item.poster_path,
    date,
    genreIds: item.genre_ids || [],
  };

  return (
    <div className="media-card">
      <Link to={`/media/${mediaType}/${item.id}`} className="media-card__link">
        <div className="media-card__poster">
          {item.poster_path ? (
            <img src={posterUrl(item.poster_path)} alt={title} loading="lazy" />
          ) : (
            <div className="media-card__no-poster">{title}</div>
          )}
          {watched && <span className="badge badge--watched">✔ Vu</span>}
          <span className="media-card__type">{mediaType === "movie" ? "Film" : "Série"}</span>
          {THEATRICAL_BADGES[theatricalStatus] && (
            <span className="media-card__theatrical">{THEATRICAL_BADGES[theatricalStatus]}</span>
          )}
        </div>
        <div className="media-card__info">
          <p className="media-card__title" title={title}>{title}</p>
          <p className="media-card__year">{year}</p>
        </div>
      </Link>
      <div className="media-card__actions">
        <button
          className={`icon-btn ${inWatchlist ? "icon-btn--gold" : ""}`}
          onClick={() => toggleWatchlist(libItem)}
          title="Envie de voir"
        >
          {inWatchlist ? "★ Envie de voir" : "☆ Envie de voir"}
        </button>
        <button
          className={`icon-btn ${watched ? "icon-btn--green" : ""}`}
          onClick={() => toggleWatched(libItem)}
          title="Marquer comme vu"
        >
          {watched ? "✔ Vu" : "○ Vu"}
        </button>
      </div>
    </div>
  );
}
