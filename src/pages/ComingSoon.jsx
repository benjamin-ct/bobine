import { useCallback, useEffect, useRef, useState } from "react";
import { discover, getGenres, getWatchProvidersList } from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import FilterBar from "../components/FilterBar";
import CountryLanguageFilter from "../components/CountryLanguageFilter";
import { Loading, ErrorMessage, EmptyState } from "../components/StateMessage";
import { useRegion } from "../context/RegionContext";
import { useFavoriteProviders } from "../context/FavoriteProvidersContext";
import { useExcludedGenres } from "../context/ExcludedGenresContext";

const WINDOWS = [
  { value: 7, label: "7 prochains jours" },
  { value: 30, label: "30 prochains jours" },
  { value: 90, label: "3 prochains mois" },
];

// Nombre de cartes révélées par "page" de scroll infini, et nombre de pages
// TMDB regroupées par lot de fetch (voir plus bas pourquoi un lot plutôt
// qu'une page à la fois).
const REVEAL_SIZE = 20;
const TMDB_PAGES_PER_BATCH = 5;

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

function releaseDateOf(item) {
  return item.release_date || item.first_air_date || "";
}

function sortByDate(items) {
  return [...items].sort((a, b) => releaseDateOf(a).localeCompare(releaseDateOf(b)));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// Récupère plusieurs pages TMDB (triées par popularité, voir plus bas) en
// parallèle et les fusionne.
async function fetchPages(mediaType, params, fromPage, count) {
  const pages = await Promise.all(
    Array.from({ length: count }, (_, i) => discover(mediaType, { ...params, page: fromPage + i }))
  );
  return pages.flatMap((p) => p.results || []);
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
  const [status, setStatus] = useState("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const { region } = useRegion();
  const { favoriteProviderIds } = useFavoriteProviders();
  const { excludedGenreIds } = useExcludedGenres();
  const activeProviderIds = useMyPlatforms ? favoriteProviderIds : providerId ? [providerId] : undefined;

  // `allResults` : lot déjà récupéré et trié par date une bonne fois pour
  // toutes (voir fetchBatch). `revealCount` : combien de ce lot est
  // actuellement affiché — le scroll infini avance d'abord dans ce lot
  // déjà trié (aucun réseau, aucun réordonnancement) avant d'aller
  // chercher un nouveau lot TMDB une fois le lot courant épuisé.
  const [allResults, setAllResults] = useState([]);
  const [revealCount, setRevealCount] = useState(REVEAL_SIZE);
  const [fetchedPages, setFetchedPages] = useState(0);
  const [tmdbTotalPages, setTmdbTotalPages] = useState(0);

  // Réinitialise les filtres dépendants au changement de type.
  useEffect(() => {
    setGenreId("");
  }, [mediaType]);

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

  const discoverParams = {
    genreId,
    excludeGenreIds: excludedGenreIds,
    providerIds: activeProviderIds,
    region,
    originCountry: country || undefined,
    originalLanguage: language || undefined,
    // On continue de FAIRE VENIR les résultats par popularité TMDB
    // (nécessaire : sans ce tri, la fenêtre de dates renvoie une bonne
    // part de fiches quasi vides — popularité ~0, souvent sans affiche —
    // avant les vraies sorties attendues ; testé en direct contre l'API,
    // TMDB n'expose pas de plancher de popularité côté discover pour
    // filtrer ce bruit nous-mêmes).
    sortField: "popularity",
    sortDirection: "desc",
    ...dateRangeFor(windowDays),
  };
  // Sérialisé pour servir de dépendance d'effet stable (l'objet littéral
  // ci-dessus est recréé à chaque rendu).
  const discoverParamsKey = JSON.stringify(discoverParams);

  // Récupère un lot de TMDB_PAGES_PER_BATCH pages TMDB (triées par
  // popularité), les fusionne avec ce qu'on a déjà, trie l'ensemble par
  // date UNE SEULE FOIS, puis les stocke. C'est le point clé : on ne
  // trie jamais un lot partiel affiché à l'écran — tant qu'un lot n'est
  // pas entièrement récupéré, rien n'est affiché ni réordonné, donc les
  // cartes déjà visibles ne sautent jamais pendant le scroll (contraire
  // au tri incrémental par page, qui réinsère les nouveaux titres
  // n'importe où dans la liste déjà affichée et fait "sauter" l'écran).
  // `frozenHead` : la portion déjà révélée à l'écran, dans l'ordre déjà
  // affiché — jamais retriée, jamais déplacée, quel que soit ce qu'on
  // charge ensuite. `tailToMerge` : ce qui a déjà été récupéré mais pas
  // encore montré (peut arriver si TMDB renvoie moins d'un lot complet).
  // Seuls `tailToMerge` + les nouveaux résultats sont fusionnés et triés
  // par date, puis recollés après `frozenHead` — ça garantit qu'une carte
  // une fois affichée ne saute plus jamais de position pendant le scroll.
  const fetchBatch = useCallback(
    async (fromPage, frozenHead, tailToMerge) => {
      const first = await discover(mediaType, { ...discoverParams, page: fromPage });
      const totalPages = Math.min(first.total_pages || 1, 500);
      const pagesToFetch = Math.min(TMDB_PAGES_PER_BATCH, totalPages - fromPage + 1);
      const rest =
        pagesToFetch > 1 ? await fetchPages(mediaType, discoverParams, fromPage + 1, pagesToFetch - 1) : [];
      const newTail = dedupe([...tailToMerge, ...(first.results || []), ...rest]);
      return {
        merged: [...frozenHead, ...sortByDate(newTail)],
        totalPages,
        newFetchedPages: fromPage - 1 + pagesToFetch,
      };
    },
    // discoverParamsKey capture toutes les valeurs utilisées par
    // discoverParams ; mediaType y est déjà inclus mais reste explicite
    // pour la lisibilité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mediaType, discoverParamsKey]
  );

  // (Re)chargement complet quand les filtres changent.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setRevealCount(REVEAL_SIZE);
    fetchBatch(1, [], [])
      .then(({ merged, totalPages, newFetchedPages }) => {
        if (cancelled) return;
        setAllResults(merged);
        setTmdbTotalPages(totalPages);
        setFetchedPages(newFetchedPages);
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
  }, [fetchBatch]);

  const loadMore = useCallback(() => {
    if (loadingMore) return;
    // D'abord épuiser ce qui est déjà en mémoire, trié, sans requête :
    // c'est le cas courant du scroll infini, instantané et sans jank.
    if (revealCount < allResults.length) {
      setRevealCount((c) => Math.min(c + REVEAL_SIZE, allResults.length));
      return;
    }
    // Plus rien à révéler localement : aller chercher un nouveau lot TMDB
    // si TMDB en a encore, fusionner et retrier — uniquement la portion
    // pas encore affichée (voir fetchBatch) — puis révéler la suite.
    if (fetchedPages >= tmdbTotalPages) return;
    setLoadingMore(true);
    const frozenHead = allResults.slice(0, revealCount);
    const tailToMerge = allResults.slice(revealCount);
    fetchBatch(fetchedPages + 1, frozenHead, tailToMerge)
      .then(({ merged, totalPages, newFetchedPages }) => {
        setAllResults(merged);
        setTmdbTotalPages(totalPages);
        setFetchedPages(newFetchedPages);
        setRevealCount((c) => Math.min(c + REVEAL_SIZE, merged.length));
      })
      .catch((err) => setError(err))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, revealCount, allResults, fetchedPages, tmdbTotalPages, fetchBatch]);

  const hasMore = revealCount < allResults.length || fetchedPages < tmdbTotalPages;
  const visibleResults = allResults.slice(0, revealCount);

  // Sentinelle observée pour déclencher le chargement de la suite dès
  // qu'elle approche du bas de l'écran (scroll infini, plus de bouton).
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
      <p className="page-subtitle">Les films et séries pas encore sortis, du plus proche au plus lointain.</p>

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
      {status === "success" && visibleResults.length === 0 && (
        <EmptyState label="Aucune sortie prévue sur cette période pour ces filtres." />
      )}

      {status === "success" && visibleResults.length > 0 && (
        <>
          <div className="media-grid">
            {visibleResults.map((item) => (
              <MediaCard key={item.id} item={{ ...item, mediaType }} showProviderBadge />
            ))}
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="load-more">
              {loadingMore && <span className="page-subtitle">Chargement…</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
