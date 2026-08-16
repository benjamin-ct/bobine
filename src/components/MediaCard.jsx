import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { posterUrl, logoUrl, getWatchProviders, formatFullDate } from "../api/tmdb";
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
  const displayDate = formatFullDate(date) || (date ? date.slice(0, 4) : "—");
  const watched = isWatched(mediaType, item.id);
  const inWatchlist = isInWatchlist(mediaType, item.id);

  // Statut "au cinéma" (France) : uniquement pour les films (les séries
  // n'ont pas de notion de sortie en salle). L'appartenance à l'index
  // (now_playing/upcoming, voir getTheatricalStatusIndex dans tmdb.js) dit
  // seulement "ce film a une distribution en salle" — TMDB inclut dans
  // now_playing une fenêtre qui peut déborder sur des sorties très proches
  // mais pas encore effectives (avant-premières...), donc le libellé final
  // ("En salles" vs "Bientôt") est tranché par la vraie date de sortie,
  // pas par la seule présence dans l'une ou l'autre liste — sinon un film
  // pas encore sorti peut afficher "En salles" à tort.
  const inTheatricalIndex = mediaType === "movie" ? getTheatricalStatus(item.id) : null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const theatricalStatus =
    inTheatricalIndex && date ? (date <= todayIso ? "in_theaters" : "upcoming") : inTheatricalIndex;

  const [provider, setProvider] = useState(null);
  // Distingue "pas encore vérifié" de "vérifié, rien trouvé" : sans ça,
  // impossible de savoir si l'absence de badge plateforme est un vrai
  // "on ne sait pas encore où" ou juste le fetch pas encore résolu.
  const [providerStatus, setProviderStatus] = useState("idle");
  useEffect(() => {
    if (!showProviderBadge) return;
    let cancelled = false;
    setProviderStatus("loading");
    getWatchProviders(mediaType, item.id, region)
      .then((data) => {
        if (cancelled) return;
        // Abonnement en priorité (le plus pertinent pour "où le regarder"),
        // sinon location/achat ; rien si le titre n'est encore distribué
        // nulle part (fréquent sur Prochainement) — pas de badge affiché.
        setProvider(data?.flatrate?.[0] || data?.rent?.[0] || data?.buy?.[0] || null);
        setProviderStatus("done");
      })
      .catch(() => {
        if (!cancelled) setProviderStatus("done");
      });
    return () => {
      cancelled = true;
    };
  }, [showProviderBadge, mediaType, item.id, region]);

  // Sur Prochainement/Nouveautés, un titre sans badge cinéma ET sans
  // plateforme connue est ambigu pour qui regarde la carte : impossible de
  // deviner si "pas de badge" veut dire "sort en streaming direct, pas
  // encore listé chez TMDB" ou "va sortir au cinéma mais hors de la fenêtre
  // now_playing/upcoming indexée". On le dit explicitement plutôt que de
  // laisser un badge muet passer pour un oubli.
  const hasTheatricalBadge = Boolean(THEATRICAL_BADGES[theatricalStatus]);
  const showUnknownStatus =
    showProviderBadge && providerStatus === "done" && !provider && !hasTheatricalBadge;

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
          {hasTheatricalBadge && (
            <span className="media-card__theatrical">{THEATRICAL_BADGES[theatricalStatus]}</span>
          )}
          {showUnknownStatus && (
            <span className="media-card__theatrical media-card__theatrical--unknown">
              ❔ Diffusion pas encore annoncée
            </span>
          )}
          {provider?.logo_path && (
            <span className="media-card__provider" title={provider.provider_name}>
              <img src={logoUrl(provider.logo_path, "w45")} alt={provider.provider_name} />
            </span>
          )}
        </div>
        <div className="media-card__info">
          <p className="media-card__title" title={title}>{title}</p>
          <p className="media-card__year">{displayDate}</p>
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
