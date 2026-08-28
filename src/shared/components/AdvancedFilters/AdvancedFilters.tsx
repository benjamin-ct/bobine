import { useEffect, useState } from "react";
import { getCountries } from "../../../core/api/tmdb.ts";
import type { Country } from "../../../core/types/tmdb.ts";
import Chip from "../Chip/Chip.tsx";
import styles from "./AdvancedFilters.module.css";

const CURRENT_YEAR = new Date().getFullYear();

export interface AdvancedFiltersState {
  yearMin: string;
  yearMax: string;
  voteAverageMin: string;
  voteAverageMax: string;
  voteCountMin: string;
  originCountry: string;
  runtimeMin: string;
  runtimeMax: string;
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFiltersState = {
  yearMin: "",
  yearMax: "",
  voteAverageMin: "",
  voteAverageMax: "",
  voteCountMin: "",
  originCountry: "",
  runtimeMin: "",
  runtimeMax: "",
};

interface AdvancedFiltersProps {
  filters: AdvancedFiltersState;
  setFilters: (updater: (prev: AdvancedFiltersState) => AdvancedFiltersState) => void;
}

export default function AdvancedFilters({ filters, setFilters }: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);

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

  function update<K extends keyof AdvancedFiltersState>(key: K, value: AdvancedFiltersState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setFilters(() => EMPTY_ADVANCED_FILTERS);
  }

  return (
    <div className={styles.wrap}>
      <Chip active={open} onClick={() => setOpen((o) => !o)}>
        {open ? "▲" : "▼"} Filtres avancés{activeCount > 0 ? ` (${activeCount})` : ""}
      </Chip>

      {open && (
        <div className={styles.panel}>
          <div className={styles.field}>
            <label>Année de sortie</label>
            <div className={styles.range}>
              <input
                type="number"
                placeholder="Min"
                min={1900}
                max={CURRENT_YEAR + 5}
                value={filters.yearMin}
                onChange={(e) => update("yearMin", e.target.value)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min={1900}
                max={CURRENT_YEAR + 5}
                value={filters.yearMax}
                onChange={(e) => update("yearMax", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>Note (sur 10)</label>
            <div className={styles.range}>
              <input
                type="number"
                placeholder="Min"
                min={0}
                max={10}
                step={0.5}
                value={filters.voteAverageMin}
                onChange={(e) => update("voteAverageMin", e.target.value)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min={0}
                max={10}
                step={0.5}
                value={filters.voteAverageMax}
                onChange={(e) => update("voteAverageMax", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>Nombre de votes minimum</label>
            <input
              type="number"
              placeholder="Ex: 100"
              min={0}
              value={filters.voteCountMin}
              onChange={(e) => update("voteCountMin", e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label>Durée (minutes)</label>
            <div className={styles.range}>
              <input
                type="number"
                placeholder="Min"
                min={0}
                value={filters.runtimeMin}
                onChange={(e) => update("runtimeMin", e.target.value)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min={0}
                value={filters.runtimeMax}
                onChange={(e) => update("runtimeMax", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>Pays de production</label>
            <select
              value={filters.originCountry}
              onChange={(e) => update("originCountry", e.target.value)}
            >
              <option value="">Tous les pays</option>
              {countries.map((c) => (
                <option key={c.iso_3166_1} value={c.iso_3166_1}>
                  {c.english_name}
                </option>
              ))}
            </select>
          </div>

          {activeCount > 0 && (
            <button type="button" className={styles.reset} onClick={reset}>
              ✕ Réinitialiser les filtres avancés
            </button>
          )}
        </div>
      )}
    </div>
  );
}
