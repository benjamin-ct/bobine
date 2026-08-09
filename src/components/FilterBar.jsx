import { SORT_OPTIONS, RUNTIME_OPTIONS } from "../api/tmdb";

export default function FilterBar({
  mediaType, setMediaType,
  genreId, setGenreId, genres,
  providerId, setProviderId, providers,
  sortBy, setSortBy,
  runtimeMax, setRuntimeMax,
}) {
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

      <select value={genreId} onChange={(e) => setGenreId(e.target.value)} className="filter-bar__select">
        <option value="">Tous les genres</option>
        {genres.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>

      <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="filter-bar__select">
        <option value="">Toutes les plateformes</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {setRuntimeMax && (
        <select value={runtimeMax} onChange={(e) => setRuntimeMax(e.target.value)} className="filter-bar__select">
          {RUNTIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {setSortBy && (
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-bar__select">
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
