import { useEffect, useState } from "react";
import { discover, getGenres, getWatchProvidersList } from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import FilterBar from "../components/FilterBar";
import { Loading, ErrorMessage, EmptyState } from "../components/StateMessage";

export default function Discover() {
  const [mediaType, setMediaType] = useState("movie");
  const [genreId, setGenreId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [sortField, setSortField] = useState("popularity");
  const [sortDirection, setSortDirection] = useState("desc");
  const [genres, setGenres] = useState([]);
  const [providers, setProviders] = useState([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Réinitialise les filtres dépendants et la liste au changement de type.
  useEffect(() => {
    setGenreId("");
    setPage(1);
  }, [mediaType]);

  useEffect(() => {
    setPage(1);
  }, [genreId, providerId, sortField, sortDirection]);

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

  // Recharge depuis le début quand les filtres changent (page revient à 1).
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    discover(mediaType, { page: 1, genreId, providerIds: providerId ? [providerId] : undefined, sortField, sortDirection })
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
  }, [mediaType, genreId, providerId, sortField, sortDirection]);

  function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    discover(mediaType, { page: nextPage, genreId, providerIds: providerId ? [providerId] : undefined, sortField, sortDirection })
      .then((data) => {
        setResults((prev) => [...prev, ...(data.results || [])]);
        setPage(nextPage);
      })
      .catch((err) => setError(err))
      .finally(() => setLoadingMore(false));
  }

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
        sortField={sortField}
        setSortField={setSortField}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
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
          {page < totalPages && (
            <div className="load-more">
              <button className="btn btn--lg" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Chargement…" : "Afficher plus"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
