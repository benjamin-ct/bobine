import { useEffect, useState } from "react";
import { getCountries } from "../api/tmdb";

const CURRENT_YEAR = new Date().getFullYear();

export default function AdvancedFilters({ filters, setFilters }) {
  const [open, setOpen] = useState(false);
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getCountries()
      .then((list) => !cancelled && setCountries(list))
      .catch(() => !cancelled && setCountries([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = Object.values(filters).filter((v) => v !== "" && v != null).length;

  function update(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setFilters({
      yearMin: "", yearMax: "",
      voteAverageMin: "", voteAverageMax: "",
      voteCountMin: "",
      originCountry: "",
      runtimeMin: "", runtimeMax: "",
    });
  }

  return (
    <div className="advanced-filters">
      <button type="button" className="chip" onClick={() => setOpen((o) => !o)}>
        {open ? "▲" : "▼"} Filtres avancés{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>

      {open && (
        <div className="advanced-filters__panel">
          <div className="advanced-filters__field">
            <label>Année de sortie</label>
            <div className="advanced-filters__range">
              <input
                type="number"
                placeholder="Min"
                min="1900"
                max={CURRENT_YEAR + 5}
                value={filters.yearMin}
                onChange={(e) => update("yearMin", e.target.value)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min="1900"
                max={CURRENT_YEAR + 5}
                value={filters.yearMax}
                onChange={(e) => update("yearMax", e.target.value)}
              />
            </div>
          </div>

          <div className="advanced-filters__field">
            <label>Note (sur 10)</label>
            <div className="advanced-filters__range">
              <input
                type="number"
                placeholder="Min"
                min="0"
                max="10"
                step="0.5"
                value={filters.voteAverageMin}
                onChange={(e) => update("voteAverageMin", e.target.value)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min="0"
                max="10"
                step="0.5"
                value={filters.voteAverageMax}
                onChange={(e) => update("voteAverageMax", e.target.value)}
              />
            </div>
          </div>

          <div className="advanced-filters__field">
            <label>Nombre de votes minimum</label>
            <input
              type="number"
              placeholder="Ex: 100"
              min="0"
              value={filters.voteCountMin}
              onChange={(e) => update("voteCountMin", e.target.value)}
            />
          </div>

          <div className="advanced-filters__field">
            <label>Durée (minutes)</label>
            <div className="advanced-filters__range">
              <input
                type="number"
                placeholder="Min"
                min="0"
                value={filters.runtimeMin}
                onChange={(e) => update("runtimeMin", e.target.value)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min="0"
                value={filters.runtimeMax}
                onChange={(e) => update("runtimeMax", e.target.value)}
              />
            </div>
          </div>

          <div className="advanced-filters__field">
            <label>Pays de production</label>
            <select value={filters.originCountry} onChange={(e) => update("originCountry", e.target.value)}>
              <option value="">Tous les pays</option>
              {countries.map((c) => (
                <option key={c.iso_3166_1} value={c.iso_3166_1}>{c.english_name}</option>
              ))}
            </select>
          </div>

          {activeCount > 0 && (
            <button type="button" className="advanced-filters__reset" onClick={reset}>
              ✕ Réinitialiser les filtres avancés
            </button>
          )}
        </div>
      )}
    </div>
  );
}
