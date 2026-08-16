import { useCallback, useEffect, useRef, useState } from "react";
import { discover, getGenres, getWatchProvidersList } from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import FilterBar from "../components/FilterBar";
import CountryLanguageFilter from "../components/CountryLanguageFilter";
import { Loading, ErrorMessage, EmptyState } from "../components/StateMessage";
import { useRegion } from "../context/RegionContext";
import { useFavoriteProviders } from "../context/FavoriteProvidersContext";

const WINDOWS = [
  { value: 7, label: "7 prochains jours" },
  { value: 30, label: "30 prochains jours" },
  { value: 90, label: "3 prochains mois" },
];

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Fenêtre [demain ; aujourd'hui + windowDays] : uniquement des titres pas
// encore sortis (démarre à demain pour ne pas chevaucher "Nouveautés", qui
// couvre jusqu'à aujourd'hui inclus).
function dateRangeFor(windowDays) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() + 1);
  const to = new Date(today);
  to.setDate(to.getDate() + windowDays);
  return { dateFrom: toIsoDate(from), dateTo: toIsoDate(to) };
}

export default function ComingSoon() {
  const [mediaType, setMediaType] = useState("movie");
  const [genreId, setGenreId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [useMyPlatforms, setUseMyPlatforms] = useState(false);
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [genres, setGenres] = useState([]);
  const [providers, setProviders] = useState([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const { region } = useRegion();
  const { favoriteProviderIds } = useFavoriteProviders();
  const activeProviderIds = useMyPlatforms ? favoriteProviderIds : providerId ? [providerId] : undefined;

  // Réinitialise les filtres dépendants et la liste au changement de type.
  useEffect(() => {
    setGenreId("");
    setPage(1);
  }, [mediaType]);

  useEffect(() => {
    setPage(1);
  }, [genreId, providerId, useMyPlatforms, country, language, windowDays]);

  useEffect(() => {
    let cancelled = false;
    getGenres(mediaType)
      .then((data) => !cancelled && setGenres(data.genres || []))
      .catch(() => !cancelled && setGenres([]));
    getWatchProvidersList(mediaType, region)
      .then((list) => !cancelled && setProviders(list))
      .catch(() => !cancelled && setProviders([]));
    return () => {
      cancelled = true;
    };
  }, [mediaType, region]);

  // Recharge depuis le début quand les filtres changent (page revient à 1).
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    discover(mediaType, {
      page: 1,
      genreId,
      providerIds: activeProviderIds,
      region,
      originCountry: country || undefined,
      originalLanguage: language || undefined,
      sortField: "popularity",
      sortDirection: "desc",
      ...dateRangeFor(windowDays),
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
  }, [mediaType, genreId, providerId, useMyPlatforms, favoriteProviderIds, region, country, language, windowDays]);

  const loadMore = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    discover(mediaType, {
      page: nextPage,
      genreId,
      providerIds: activeProviderIds,
      region,
      originCountry: country || undefined,
      originalLanguage: language || undefined,
      sortField: "popularity",
      sortDirection: "desc",
      ...dateRangeFor(windowDays),
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
  }, [loadingMore, page, totalPages, mediaType, genreId, providerId, useMyPlatforms, favoriteProviderIds, region, country, language, windowDays]);

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
      <h1>Prochainement</h1>
      <p className="page-subtitle">Les films et séries pas encore sortis, les plus attendus d'abord.</p>

      <FilterBar
        mediaType={mediaType}
        setMediaType={setMediaType}
        genreId={genreId}
        setGenreId={setGenreId}
        genres={genres}
        providerId={providerId}
        setProviderId={setProviderId}
        providers={providers}
        favoriteProviderIds={favoriteProviderIds}
        useFavoriteProviders={useMyPlatforms}
        setUseFavoriteProviders={setUseMyPlatforms}
      />

      <CountryLanguageFilter
        country={country}
        setCountry={setCountry}
        language={language}
        setLanguage={setLanguage}
      />

      <div className="filter-bar__group" style={{ marginBottom: 18 }}>
        {WINDOWS.map((w) => (
          <button
            key={w.value}
            className={windowDays === w.value ? "chip chip--active" : "chip"}
            onClick={() => setWindowDays(w.value)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {status === "loading" && <Loading />}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "success" && results.length === 0 && (
        <EmptyState label="Aucune sortie prévue sur cette période pour ces filtres." />
      )}

      {status === "success" && results.length > 0 && (
        <>
          <div className="media-grid">
            {results.map((item) => (
              <MediaCard key={item.id} item={{ ...item, mediaType }} showProviderBadge />
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
