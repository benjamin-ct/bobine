import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { backdropUrl, posterUrl, getDetails, getWatchProviders } from "../api/tmdb";
import ProviderBadges from "../components/ProviderBadges";
import TrailerButton from "../components/TrailerButton";
import MediaCard from "../components/MediaCard";
import CastCard from "../components/CastCard";
import { Loading, ErrorMessage } from "../components/StateMessage";
import { useLibrary } from "../context/LibraryContext";

export default function Detail() {
  const { mediaType, id } = useParams();
  const [details, setDetails] = useState(null);
  const [providers, setProviders] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useLibrary();
  const recommendationsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([getDetails(mediaType, id), getWatchProviders(mediaType, id)])
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
  }, [mediaType, id]);

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

  const cast = details.credits?.cast || [];

  const libItem = {
    id: Number(id),
    mediaType,
    title,
    posterPath: details.poster_path,
    date,
    genreIds: details.genres?.map((g) => g.id) || [],
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
            <h1>{title} {date && <span className="detail-year">({date.slice(0, 4)})</span>}</h1>
            <p className="detail-meta">
              {details.genres?.map((g) => g.name).join(" · ")}
              {runtime ? ` · ${runtime} min` : ""}
              {details.vote_average ? ` · ⭐ ${details.vote_average.toFixed(1)}` : ""}
            </p>
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

            <h3>Où regarder en France</h3>
            <ProviderBadges providers={providers} />
          </div>
        </div>

        {cast.length > 0 && (
          <section className="detail-cast">
            <h3>Casting</h3>
            <div className="person-grid">
              {cast.map((member) => (
                <CastCard key={member.credit_id || `${member.id}-${member.character}`} member={member} />
              ))}
            </div>
          </section>
        )}

        {details.recommendations?.results?.length > 0 && (
          <section className="detail-recommendations" id="recommendations" ref={recommendationsRef}>
            <h3>Parce que tu as regardé « {title} »</h3>
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
