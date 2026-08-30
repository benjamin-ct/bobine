import { useEffect, useState } from "react";
import type { FocusEvent } from "react";
import { getCountries } from "../../../core/api/tmdb.ts";
import type { Country } from "../../../core/types/tmdb.ts";
import { clampNumericValue, isRangeInverted } from "../../lib/numericRangeFilter.ts";
import Chip from "../Chip/Chip.tsx";
import styles from "./AdvancedFilters.module.css";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MIN = 1900;
const YEAR_MAX = CURRENT_YEAR + 5;
const VOTE_MIN = 0;
const VOTE_MAX = 10;

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

// Message explicite affiché (et appel API court-circuité côté pages) dès
// qu'une plage min/max saisie est incohérente, plutôt que de laisser la
// recherche retomber silencieusement sur "Aucun résultat".
export function getAdvancedFiltersRangeError(filters: AdvancedFiltersState): string | null {
  if (isRangeInverted(filters.yearMin, filters.yearMax)) {
    return "L'année minimum est supérieure à l'année maximum.";
  }
  if (isRangeInverted(filters.voteAverageMin, filters.voteAverageMax)) {
    return "La note minimum est supérieure à la note maximum.";
  }
  if (isRangeInverted(filters.runtimeMin, filters.runtimeMax)) {
    return "La durée minimum est supérieure à la durée maximum.";
  }
  return null;
}

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
  const rangeError = getAdvancedFiltersRangeError(filters);

  function update<K extends keyof AdvancedFiltersState>(key: K, value: AdvancedFiltersState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  // Plafonne la valeur saisie une fois le champ quitté (plutôt qu'à chaque
  // frappe, ce qui empêcherait de taper un nombre à plusieurs chiffres dès
  // que sa valeur intermédiaire sort des bornes, ex. "2" < 1900).
  function clampOnBlur<K extends keyof AdvancedFiltersState>(key: K, min: number, max?: number) {
    return (e: FocusEvent<HTMLInputElement>) => {
      const clamped = clampNumericValue(e.target.value, min, max);
      if (clamped !== e.target.value) {
        update(key, clamped as AdvancedFiltersState[K]);
      }
    };
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
                min={YEAR_MIN}
                max={YEAR_MAX}
                value={filters.yearMin}
                onChange={(e) => update("yearMin", e.target.value)}
                onBlur={clampOnBlur("yearMin", YEAR_MIN, YEAR_MAX)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min={YEAR_MIN}
                max={YEAR_MAX}
                value={filters.yearMax}
                onChange={(e) => update("yearMax", e.target.value)}
                onBlur={clampOnBlur("yearMax", YEAR_MIN, YEAR_MAX)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>Note (sur 10)</label>
            <div className={styles.range}>
              <input
                type="number"
                placeholder="Min"
                min={VOTE_MIN}
                max={VOTE_MAX}
                step={0.5}
                value={filters.voteAverageMin}
                onChange={(e) => update("voteAverageMin", e.target.value)}
                onBlur={clampOnBlur("voteAverageMin", VOTE_MIN, VOTE_MAX)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min={VOTE_MIN}
                max={VOTE_MAX}
                step={0.5}
                value={filters.voteAverageMax}
                onChange={(e) => update("voteAverageMax", e.target.value)}
                onBlur={clampOnBlur("voteAverageMax", VOTE_MIN, VOTE_MAX)}
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
              onBlur={clampOnBlur("voteCountMin", 0)}
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
                onBlur={clampOnBlur("runtimeMin", 0)}
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Max"
                min={0}
                value={filters.runtimeMax}
                onChange={(e) => update("runtimeMax", e.target.value)}
                onBlur={clampOnBlur("runtimeMax", 0)}
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

          {rangeError && (
            <p className={styles.rangeError} role="alert">
              ⚠️ {rangeError}
            </p>
          )}

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
