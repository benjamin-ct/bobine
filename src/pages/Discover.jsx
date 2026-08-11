import { useCallback, useEffect, useRef, useState } from "react";
import { discover, getGenres, getWatchProvidersList } from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import FilterBar from "../components/FilterBar";
import AdvancedFilters from "../components/AdvancedFilters";
import { Loading, ErrorMessage, EmptyState } from "../components/StateMessage";

const EMPTY_ADVANCED_FILTERS = {
  yearMin: "", yearMax: "",
  voteAverageMin: "", voteAverageMax: "",
  voteCountMin: "",
  originCountry: "",
  runtimeMin: "", runtimeMax: "",
};

// Convertit les valeurs texte des <input> en nombres (ou undefined si vide)
// pour discover().
function toDiscoverParams(advanced) {
  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  return {
    yearMin: num(advanced.yearMin),
    yearMax: num(advanced.yearMax),
    voteAverageMin: num(advanced.voteAverageMin),
    voteAverageMax: num(advanced.voteAverageMax),
    voteCountMin: num(advanced.voteCountMin),
    runtimeMin: num(advanced.runtimeMin),
    runtimeMax: num(advanced.runtimeMax),
    originCountry: advanced.originCountry || undefined,
  };
}

export default function Discover() {
  const [mediaType, setMediaType] = useState("movie");
  const [genreId, setGenreId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [sortField, setSortField] = useState("popularity");
  const [sortDirection, setSortDirection] = useState("desc");
  const [advanced, setAdvanced] = useState(EMPTY_ADVANCED_FILTERS);
  const [genres, setGenres] = useState([]);
  const [providers, setProviders] = useState([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const advancedKey = JSON.stringify(advanced);

  // Réinitialise les filtres dépendants et la liste au changement de type.
  useEffect(() => {
    setGenreId("");
    setPage(1);
  }, [mediaType]);

  useEffect(() => {
    setPage(1);
  }, [genreId, providerId, sortField, sortDirection, advancedKey]);

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
    discover(mediaType, {
      page: 1,
      genreId,
      providerIds: providerId ? [providerId] : undefined,
      sortField,
      sortDirection,
      ...toDiscoverParams(advanced),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, genreId, providerId, sortField, sortDirection, advancedKey]);

  const loadMore = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    discover(mediaType, {
      page: nextPage,
      genreId,
      providerIds: providerId ? [providerId] : undefined,
      sortField,
      sortDirection,
      ...toDiscoverParams(advanced),
    })
      .then((data) => {
        // TMDB peut renvoyer un même titre sur deux pages consécutives
        // (le classement bouge légèrement pendant qu'on enchaîne les
        // requêtes) : on déduplique pour éviter les doublons à l'écran
        // et les clés React en double.
        setResults((prev) => {
          const seenIds = new Set(prev.map((item) => item.id));
          const fresh = (data.results || []).filter((item) => !seenIds.has(item.id));
          return [...prev, ...fresh];
        });
        setPage(nextPage);
      })
      .catch((err) => setError(err))
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, page, totalPages, mediaType, genreId, providerId, sortField, sortDirection, advancedKey]);

  // Sentinelle observée pour déclencher le chargement de la page suivante
  // dès qu'elle approche du bas de l'écran (scroll infini, plus de bouton).
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (status !== "success") return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, loadMore]);

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

      <AdvancedFilters filters={advanced} setFilters={setAdvanced} />

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
            <div ref={sentinelRef} className="load-more">
              {loadingMore && <span className="page-subtitle">Chargement…</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
