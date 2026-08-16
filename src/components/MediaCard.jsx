import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { posterUrl, logoUrl, getWatchProviders } from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";
import { useRegion } from "../context/RegionContext";

const THEATRICAL_BADGES = {
  in_theaters: "🎬 En salles",
  upcoming: "🗓️ Bientôt au cinéma",
};

// `showProviderBadge` : opt-in, seules Nouveautés/Prochainement l'activent.
// Contrairement à la pastille théâtrale (indexée une fois pour toute la
// grille, voir getTheatricalStatusIndex), TMDB n'a pas d'équivalent en
// masse pour "quelles plateformes pour ces N titres" — un appel par carte
// est ici incontournable. Le scope opt-in limite où ce coût est payé ; le
// cache mémoire de getWatchProviders() et le cache d'edge du proxy TMDB
// (voir worker/index.js) atténuent le reste.
export default function MediaCard({ item, showProviderBadge = false }) {
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useLibrary();
  const { getTheatricalStatus, region } = useRegion();
  const mediaType = item.mediaType || item.media_type;
  const title = item.title || item.name;
  const date = item.release_date || item.first_air_date;
  const year = date ? date.slice(0, 4) : "—";
  const watched = isWatched(mediaType, item.id);
  const inWatchlist = isInWatchlist(mediaType, item.id);

  // Statut "au cinéma" (France) : uniquement pour les films (les séries
  // n'ont pas de notion de sortie en salle). Lookup synchrone dans l'index
  // chargé une fois par RegionContext (voir getTheatricalStatusIndex,
  // src/api/tmdb.js) — aucun appel réseau par carte.
  const theatricalStatus = mediaType === "movie" ? getTheatricalStatus(item.id) : null;

  const [provider, setProvider] = useState(null);
  useEffect(() => {
    if (!showProviderBadge) return;
    let cancelled = false;
    getWatchProviders(mediaType, item.id, region)
      .then((data) => {
        if (cancelled) return;
        // Abonnement en priorité (le plus pertinent pour "où le regarder"),
        // sinon location/achat ; rien si le titre n'est encore distribué
        // nulle part (fréquent sur Prochainement) — pas de badge affiché.
        setProvider(data?.flatrate?.[0] || data?.rent?.[0] || data?.buy?.[0] || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showProviderBadge, mediaType, item.id, region]);

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
          {provider?.logo_path && (
            <span className="media-card__provider" title={provider.provider_name}>
              <img src={logoUrl(provider.logo_path, "w45")} alt={provider.provider_name} />
            </span>
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
