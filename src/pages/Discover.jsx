import { useEffect, useState } from "react";
import { discover, getGenres, getWatchProvidersList } from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import FilterBar from "../components/FilterBar";
import { Loading, ErrorMessage, EmptyState } from "../components/StateMessage";

export default function Discover() {
  const [mediaType, setMediaType] = useState("movie");
  const [genreId, setGenreId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [sortBy, setSortBy] = useState("popularity.desc");
  const [runtimeMax, setRuntimeMax] = useState("");
  const [genres, setGenres] = useState([]);
  const [providers, setProviders] = useState([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  // Réinitialise les filtres dépendants et la pagination au changement de type.
  useEffect(() => {
    setGenreId("");
    setPage(1);
  }, [mediaType]);

  useEffect(() => {
    setPage(1);
  }, [genreId, providerId, sortBy, runtimeMax]);

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

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    discover(mediaType, {
      page,
      genreId,
      providerIds: providerId ? [providerId] : undefined,
      sortBy,
      runtimeMax,
    })
      .then((data) => {
        if (cancelled) return;
        setResults(data.results || []);
        setTotalPages(Math.min(data.total_pages || 1, 500));
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
  }, [mediaType, genreId, providerId, sortBy, runtimeMax, page]);

  return (
    <div className="page">
      <h1>Découvrir</h1>
      <FilterBar
        mediaType={mediaType}
        setMediaType={setMediaType}
        genreId={genreId}
        setGenreId={setGenreId}
        genres={genres}
        providerId={providerId}
        setProviderId={setProviderId}
        providers={providers}
        sortBy={sortBy}
        setSortBy={setSortBy}
        runtimeMax={runtimeMax}
        setRuntimeMax={setRuntimeMax}
      />

      {status === "loading" && <Loading />}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "success" && results.length === 0 && (
        <EmptyState label="Aucun résultat pour ces filtres." />
      )}

      {status === "success" && results.length > 0 && (
        <>
          <div className="media-grid">
            {results.map((item) => (
              <MediaCard key={item.id} item={{ ...item, mediaType }} />
            ))}
          </div>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
            <span>Page {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
          </div>
        </>
      )}
    </div>
  );
}
