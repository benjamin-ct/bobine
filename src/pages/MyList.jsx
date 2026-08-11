import { useState } from "react";
import { Link } from "react-router-dom";
import { posterUrl } from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";
import Stats from "../components/Stats";
import NotificationSettings from "../components/NotificationSettings";

function Row({ item }) {
  const { toggleWatched, toggleWatchlist, isWatched, isInWatchlist } = useLibrary();
  const watched = isWatched(item.mediaType, item.id);
  const inWatchlist = isInWatchlist(item.mediaType, item.id);
  const year = item.date ? item.date.slice(0, 4) : "—";

  return (
    <div className="list-row">
      <Link to={`/media/${item.mediaType}/${item.id}`} className="list-row__link">
        {item.posterPath ? (
          <img src={posterUrl(item.posterPath, "w92")} alt={item.title} />
        ) : (
          <div className="list-row__no-poster" />
        )}
        <div>
          <p className="list-row__title">{item.title}</p>
          <p className="list-row__meta">
            {item.mediaType === "movie" ? "Film" : "Série"} · {year}
            {item.rating && <span className="rating-badge"> · ★ {item.rating}/10</span>}
          </p>
        </div>
      </Link>
      <div className="list-row__actions">
        <button
          className={`icon-btn ${inWatchlist ? "icon-btn--gold" : ""}`}
          onClick={() => toggleWatchlist(item)}
          title="Envie de voir"
        >
          {inWatchlist ? "★" : "☆"}
        </button>
        <button
          className={`icon-btn ${watched ? "icon-btn--green" : ""}`}
          onClick={() => toggleWatched(item)}
          title="Marquer comme vu"
        >
          {watched ? "✔" : "○"}
        </button>
        {watched && (
          <Link
            className="icon-btn icon-btn--text"
            to={`/media/${item.mediaType}/${item.id}#recommendations`}
            title="Trouver des titres similaires"
          >
            Similaire
          </Link>
        )}
      </div>
    </div>
  );
}

export default function MyList() {
  const { watched, watchlist } = useLibrary();
  const [tab, setTab] = useState("watchlist");
  const items = tab === "watchlist" ? watchlist : watched;

  return (
    <div className="page">
      <h1>Ma liste</h1>

      <NotificationSettings />

      <div className="filter-bar__group" style={{ marginBottom: 20 }}>
        <button className={tab === "watchlist" ? "chip chip--active" : "chip"} onClick={() => setTab("watchlist")}>
          Envie de voir ({watchlist.length})
        </button>
        <button className={tab === "watched" ? "chip chip--active" : "chip"} onClick={() => setTab("watched")}>
          Déjà vu ({watched.length})
        </button>
      </div>

      {tab === "watched" && <Stats watched={watched} />}

      {items.length === 0 ? (
        <p className="page-subtitle">
          {tab === "watchlist"
            ? "Ta liste d'envies est vide. Ajoute des titres depuis les fiches ou le tirage aléatoire."
            : "Tu n'as encore rien marqué comme vu."}
        </p>
      ) : (
        <div className="list-rows">
          {items.map((item) => (
            <Row key={`${item.mediaType}:${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
