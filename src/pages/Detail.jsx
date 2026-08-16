import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  backdropUrl,
  posterUrl,
  getDetails,
  getWatchProviders,
  estimateRuntimeMinutes,
  getFrenchTheatricalDateFromDetails,
  theatricalStatusFromDate,
  formatFullDate,
} from "../api/tmdb";
import ProviderBadges from "../components/ProviderBadges";
import TrailerButton from "../components/TrailerButton";
import MediaCard from "../components/MediaCard";
import CastCard from "../components/CastCard";
import RatingInput from "../components/RatingInput";
import EpisodeTracker from "../components/EpisodeTracker";
import { Loading, ErrorMessage } from "../components/StateMessage";
import { useLibrary } from "../context/LibraryContext";
import { useRegion } from "../context/RegionContext";

const MAIN_CAST_COUNT = 12;

export default function Detail() {
  const { mediaType, id } = useParams();
  const [details, setDetails] = useState(null);
  const [providers, setProviders] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [showFullCast, setShowFullCast] = useState(false);
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist, getRating, rateWatched } = useLibrary();
  const { region, regionName } = useRegion();
  const recommendationsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setShowFullCast(false);
    Promise.all([getDetails(mediaType, id), getWatchProviders(mediaType, id, region)])
      .then(([d, p]) => {
        if (cancelled) return;
        setDetails(d);
        setProviders(p);
        setStatus("success");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mediaType, id, region]);

  // Saute directement aux titres similaires si on arrive via le bouton "🔁".
  useEffect(() => {
    if (status === "success" && window.location.hash === "#recommendations") {
      recommendationsRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [status]);

  if (status === "loading") return <div className="page"><Loading /></div>;
  if (status === "error") return <div className="page"><ErrorMessage error={error} /></div>;
  if (!details) return null;

  const title = details.title || details.name;
  const date = details.release_date || details.first_air_date;
  const runtime = details.runtime || details.episode_run_time?.[0];
  const watched = isWatched(mediaType, id);
  const inWatchlist = isInWatchlist(mediaType, id);

  // Statut "au cinéma" (France) : uniquement pour les films. release_dates
  // est déjà inclus dans `details` (voir getDetails côté tmdb.js), pas
  // d'appel réseau supplémentaire ici.
  const theatricalDate = mediaType === "movie" ? getFrenchTheatricalDateFromDetails(details) : null;
  const theatricalStatus = theatricalStatusFromDate(theatricalDate);
  const theatricalDateFormatted = theatricalDate
    ? new Date(theatricalDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const theatricalMessage = {
    in_theaters: `🎬 Actuellement au cinéma (sorti le ${theatricalDateFormatted})`,
    upcoming: `🗓️ Sortie au cinéma prévue le ${theatricalDateFormatted}`,
    past: `Sorti au cinéma le ${theatricalDateFormatted}`,
  }[theatricalStatus];

  const cast = details.credits?.cast || [];
  const visibleCast = showFullCast ? cast : cast.slice(0, MAIN_CAST_COUNT);
  const remainingCastCount = cast.length - visibleCast.length;

  // Films : le·s réalisateur·rices sont dans credits.crew. Séries : TMDB les
  // expose directement via created_by (plus fiable que de fouiller le crew).
  const directors =
    mediaType === "movie"
      ? (details.credits?.crew || []).filter((c) => c.job === "Director")
      : details.created_by || [];

  const libItem = {
    id: Number(id),
    mediaType,
    title,
    posterPath: details.poster_path,
    date,
    genreIds: details.genres?.map((g) => g.id) || [],
    runtimeMinutes: estimateRuntimeMinutes(details, mediaType),
  };

  function scrollToRecommendations() {
    recommendationsRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="detail-page">
      <div
        className="detail-hero"
        style={{ backgroundImage: details.backdrop_path ? `url(${backdropUrl(details.backdrop_path)})` : undefined }}
      >
        <div className="detail-hero__overlay" />
      </div>

      <div className="detail-content page">
        <div className="detail-main">
          {details.poster_path && (
            <img className="detail-poster" src={posterUrl(details.poster_path, "w342")} alt={title} />
          )}
          <div className="detail-info">
            <h1>{title} {date && <span className="detail-year">({formatFullDate(date) || date.slice(0, 4)})</span>}</h1>
            <p className="detail-meta">
              {details.genres?.map((g) => g.name).join(" · ")}
              {mediaType === "tv" && details.number_of_seasons
                ? ` · ${details.number_of_seasons} saison${details.number_of_seasons > 1 ? "s" : ""}`
                : ""}
              {mediaType === "tv" && details.number_of_episodes ? ` · ${details.number_of_episodes} épisodes` : ""}
              {runtime ? ` · ${runtime} min${mediaType === "tv" ? "/épisode" : ""}` : ""}
              {details.vote_average ? ` · ⭐ ${details.vote_average.toFixed(1)}` : ""}
            </p>
            {theatricalMessage && <p className="detail-theatrical">{theatricalMessage}</p>}
            <p className="detail-overview">{details.overview || "Pas de synopsis disponible."}</p>

            <div className="detail-actions">
              <button className={`btn ${inWatchlist ? "btn--gold" : ""}`} onClick={() => toggleWatchlist(libItem)}>
                {inWatchlist ? "★ Envie de voir" : "☆ Envie de voir"}
              </button>
              <button className={`btn ${watched ? "btn--green" : ""}`} onClick={() => toggleWatched(libItem)}>
                {watched ? "✔ Déjà vu" : "○ Marquer comme vu"}
              </button>
              <TrailerButton videos={details.videos?.results} />
              {details.recommendations?.results?.length > 0 && (
                <button className="btn" onClick={scrollToRecommendations}>🔁 Similaire</button>
              )}
            </div>

            {watched && (
              <RatingInput value={getRating(mediaType, id)} onRate={(rating) => rateWatched(mediaType, id, rating)} />
            )}

            <h3>Où regarder{regionName ? ` (${regionName})` : ""}</h3>
            <ProviderBadges providers={providers} />
          </div>
        </div>

        {mediaType === "tv" && details.seasons?.length > 0 && (
          <EpisodeTracker item={libItem} seasons={details.seasons} />
        )}

        {(directors.length > 0 || cast.length > 0) && (
          <section className="detail-cast">
            {directors.length > 0 && (
              <>
                <h3>{mediaType === "movie" ? "Réalisation" : "Créé par"}</h3>
                <div className="person-grid person-grid--compact">
                  {directors.map((person) => (
                    <CastCard
                      key={person.credit_id || person.id}
                      member={person}
                      role={mediaType === "movie" ? "Réalisateur/Réalisatrice" : "Créateur/Créatrice"}
                    />
                  ))}
                </div>
              </>
            )}

            {cast.length > 0 && (
              <>
                <h3>Casting principal</h3>
                <div className="person-grid">
                  {visibleCast.map((member) => (
                    <CastCard key={member.credit_id || `${member.id}-${member.character}`} member={member} />
                  ))}
                </div>
                {remainingCastCount > 0 && (
                  <div className="load-more">
                    <button className="btn" onClick={() => setShowFullCast(true)}>
                      Afficher tout le casting ({remainingCastCount} de plus)
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {details.recommendations?.results?.length > 0 && (
          <section className="detail-recommendations" id="recommendations" ref={recommendationsRef}>
            <h3>Si tu as aimé « {title} »</h3>
            <div className="media-grid">
              {details.recommendations.results.slice(0, 12).map((item) => (
                <MediaCard key={item.id} item={{ ...item, mediaType: item.media_type || mediaType }} />
              ))}
            </div>
          </section>
        )}

        <Link to="/" className="back-link">← Retour</Link>
      </div>
    </div>
  );
}
