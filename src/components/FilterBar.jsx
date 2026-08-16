import { SORT_FIELDS } from "../api/tmdb";

export default function FilterBar({
  mediaType,
  setMediaType,
  genreId,
  setGenreId,
  genres,
  providerId,
  setProviderId,
  providers,
  sortField,
  setSortField,
  sortDirection,
  setSortDirection,
  // Optionnels : n'apparaissent que si l'appelant a configuré des
  // plateformes favorites (voir FavoriteProvidersContext) — un seul mode
  // "plateforme" actif à la fois, comme le <select> ci-dessous ne permet
  // qu'un seul provider à la fois.
  favoriteProviderIds,
  useFavoriteProviders,
  setUseFavoriteProviders,
}) {
  const hasFavorites = favoriteProviderIds?.length > 0;

  function onProviderSelect(value) {
    setProviderId(value);
    if (value && useFavoriteProviders) {
      setUseFavoriteProviders(false);
    }
  }

  function onToggleFavorites() {
    const next = !useFavoriteProviders;
    setUseFavoriteProviders(next);
    if (next && providerId) {
      setProviderId("");
    }
  }

  return (
    <div className="filter-bar">
      <div className="filter-bar__group">
        <button
          className={mediaType === "movie" ? "chip chip--active" : "chip"}
          onClick={() => setMediaType("movie")}
        >
          Films
        </button>
        <button
          className={mediaType === "tv" ? "chip chip--active" : "chip"}
          onClick={() => setMediaType("tv")}
        >
          Séries
        </button>
      </div>

      <select
        value={genreId}
        onChange={(e) => setGenreId(e.target.value)}
        className="filter-bar__select"
      >
        <option value="">Tous les genres</option>
        {genres.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      <select
        value={providerId}
        onChange={(e) => onProviderSelect(e.target.value)}
        className="filter-bar__select"
        disabled={useFavoriteProviders}
      >
        <option value="">Toutes les plateformes</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {hasFavorites && (
        <button
          type="button"
          className={useFavoriteProviders ? "chip chip--active" : "chip"}
          onClick={onToggleFavorites}
          title="Filtrer sur les plateformes que tu as cochées dans Ma liste"
        >
          🎯 Mes plateformes
        </button>
      )}

      {setSortField && (
        <div className="sort-control">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value)}
            className="filter-bar__select"
          >
            {SORT_FIELDS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="sort-direction-btn"
            onClick={() => setSortDirection(sortDirection === "desc" ? "asc" : "desc")}
            title={
              sortDirection === "desc"
                ? "Décroissant (cliquer pour croissant)"
                : "Croissant (cliquer pour décroissant)"
            }
          >
            {sortDirection === "desc" ? "↓" : "↑"}
          </button>
        </div>
      )}
    </div>
  );
}
