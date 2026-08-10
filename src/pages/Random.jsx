import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { discover, getGenres, getWatchProvidersList, getDetails, getWatchProviders, posterUrl, estimateRuntimeMinutes } from "../api/tmdb";
import FilterBar from "../components/FilterBar";
import ProviderBadges from "../components/ProviderBadges";
import TrailerButton from "../components/TrailerButton";
import { Loading, ErrorMessage } from "../components/StateMessage";
import { useLibrary } from "../context/LibraryContext";

const MAX_ATTEMPTS = 6;

export default function Random() {
  const [mediaType, setMediaType] = useState("movie");
  const [genreId, setGenreId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [genres, setGenres] = useState([]);
  const [providers, setProviders] = useState([]);
  const [excludeWatched, setExcludeWatched] = useState(true);

  const [pick, setPick] = useState(null);
  const [pickDetails, setPickDetails] = useState(null);
  const [providersResult, setProvidersResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const { watchedIds, isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useLibrary();

  useEffect(() => {
    setGenreId("");
  }, [mediaType]);

  useEffect(() => {
    let cancelled = false;
    getGenres(mediaType)
      .then((data) => !cancelled && setGenres(data.genres || []))
      .catch(() => !cancelled && setGenres([]));
    getWatchProvidersList(mediaType)
      .then((list) => !cancelled && setProviders(list))
      .catch(() => !cancelled && setProviders([]));
    return () => {
      cancelled = true;
    };
  }, [mediaType]);

  async function drawRandom() {
    setStatus("loading");
    setError(null);
    setPick(null);
    setPickDetails(null);
    try {
      // Pas de tri : un tirage au hasard pioche déjà dans une page aléatoire,
      // trier n'a pas de sens ici (voir discover() pour le tri par défaut).
      const discoverParams = { genreId, providerIds: providerId ? [providerId] : undefined };
      const first = await discover(mediaType, { page: 1, ...discoverParams });
      const totalPages = Math.min(first.total_pages || 1, 500);
      if (totalPages === 0 || !first.results?.length) {
        setStatus("empty");
        return;
      }

      let candidate = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !candidate; attempt++) {
        const page = Math.max(1, Math.floor(Math.random() * Math.min(totalPages, 100)) + 1);
        const data = page === 1 ? first : await discover(mediaType, { page, ...discoverParams });
        let pool = data.results || [];
        if (excludeWatched) {
          pool = pool.filter((item) => !watchedIds.has(`${mediaType}:${item.id}`));
        }
        if (pool.length > 0) {
          candidate = pool[Math.floor(Math.random() * pool.length)];
        }
      }

      if (!candidate) {
        // Repli : on prend n'importe quoi de la première page, vu ou non.
        candidate = first.results[Math.floor(Math.random() * first.results.length)];
      }

      const [fullDetails, providersData] = await Promise.all([
        getDetails(mediaType, candidate.id),
        getWatchProviders(mediaType, candidate.id),
      ]);
      setPick({ ...candidate, mediaType });
      setPickDetails(fullDetails);
      setProvidersResult(providersData);
      setStatus("success");
    } catch (err) {
      setError(err);
      setStatus("error");
    }
  }

  const title = pick?.title || pick?.name;
  const date = pick?.release_date || pick?.first_air_date;
  const runtime = pickDetails?.runtime || pickDetails?.episode_run_time?.[0];
  const watched = pick && isWatched(mediaType, pick.id);
  const inWatchlist = pick && isInWatchlist(mediaType, pick.id);

  function buildLibItem() {
    return {
      id: pick.id,
      mediaType,
      title,
      posterPath: pick.poster_path,
      date,
      genreIds: pick.genre_ids || [],
      runtimeMinutes: estimateRuntimeMinutes(pickDetails, mediaType),
    };
  }

  return (
    <div className="page">
      <h1>Un film ou une série au hasard 🎲</h1>
      <p className="page-subtitle">
        Plus une envie de choisir ? Filtre si tu veux, puis laisse Bobine décider pour toi.
      </p>

      <FilterBar
        mediaType={mediaType}
        setMediaType={setMediaType}
        genreId={genreId}
        setGenreId={setGenreId}
        genres={genres}
        providerId={providerId}
        setProviderId={setProviderId}
        providers={providers}
      />

      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={excludeWatched}
          onChange={(e) => setExcludeWatched(e.target.checked)}
        />
        Exclure ce que j'ai déjà vu
      </label>

      <button className="btn btn--primary btn--lg" onClick={drawRandom} disabled={status === "loading"}>
        {status === "loading" ? "Tirage en cours…" : pick ? "🎲 Retirer au sort" : "🎲 Tirer un titre"}
      </button>

      {status === "error" && <ErrorMessage error={error} />}
      {status === "empty" && <p className="page-subtitle">Aucun titre ne correspond à ces filtres.</p>}

      {pick && (
        <div className="random-result">
          <img className="detail-poster" src={posterUrl(pick.poster_path, "w342")} alt={title} />
          <div className="detail-info">
            <h2>{title} {date && <span className="detail-year">({date.slice(0, 4)})</span>}</h2>
            <p className="detail-meta">
              {pickDetails?.genres?.map((g) => g.name).join(" · ")}
              {runtime ? ` · ${runtime} min` : ""}
              {pick.vote_average ? ` · ⭐ ${pick.vote_average.toFixed(1)}` : ""}
            </p>
            <p className="detail-overview">{pick.overview}</p>
            <div className="detail-actions">
              <Link className="btn" to={`/media/${mediaType}/${pick.id}`}>Voir la fiche</Link>
              <button
                className={`btn ${inWatchlist ? "btn--gold" : ""}`}
                onClick={() => toggleWatchlist(buildLibItem())}
              >
                {inWatchlist ? "★ Envie de voir" : "☆ Envie de voir"}
              </button>
              <button
                className={`btn ${watched ? "btn--green" : ""}`}
                onClick={() => toggleWatched(buildLibItem())}
              >
                {watched ? "✔ Déjà vu" : "○ Marquer comme vu"}
              </button>
              <TrailerButton videos={pickDetails?.videos?.results} />
              <Link className="btn" to={`/media/${mediaType}/${pick.id}#recommendations`}>🔁 Similaire</Link>
            </div>
            <h3>Où regarder en France</h3>
            <ProviderBadges providers={providersResult} />
          </div>
        </div>
      )}
    </div>
  );
}
