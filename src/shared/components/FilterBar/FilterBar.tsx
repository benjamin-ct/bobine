import Dropdown from "../Dropdown/Dropdown.tsx";
import Chip from "../Chip/Chip.tsx";
import { SORT_FIELDS, type DiscoverSortField, type SortDirection } from "../../../core/api/tmdb.ts";
import type { Genre } from "../../../core/types/tmdb.ts";
import type { WatchProviderOption } from "../../../core/api/tmdb.ts";
import dropdownStyles from "../Dropdown/Dropdown.module.css";
import styles from "./FilterBar.module.css";

const CHECK_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

interface FilterBarProps {
  mediaType: "movie" | "tv";
  setMediaType: (v: "movie" | "tv") => void;
  genreIds: number[];
  setGenreIds: (ids: number[]) => void;
  genres: Genre[];
  providerId: string;
  setProviderId: (v: string) => void;
  providers: WatchProviderOption[];
  // Optionnels : n'apparaissent que si l'appelant a configuré des
  // plateformes favorites — un seul mode "plateforme" actif à la fois.
  favoriteProviderIds?: number[];
  useFavoriteProviders?: boolean;
  setUseFavoriteProviders?: (v: boolean) => void;
  sortField?: DiscoverSortField;
  setSortField?: (v: DiscoverSortField) => void;
  sortDirection?: SortDirection;
  setSortDirection?: (v: SortDirection) => void;
}

export default function FilterBar({
  mediaType,
  setMediaType,
  genreIds,
  setGenreIds,
  genres,
  providerId,
  setProviderId,
  providers,
  favoriteProviderIds,
  useFavoriteProviders,
  setUseFavoriteProviders,
  sortField,
  setSortField,
  sortDirection,
  setSortDirection,
}: FilterBarProps) {
  const hasFavorites = (favoriteProviderIds?.length ?? 0) > 0;

  function onProviderSelect(value: string) {
    setProviderId(value);
    if (value && useFavoriteProviders) {
      setUseFavoriteProviders?.(false);
    }
  }

  function onToggleFavorites() {
    const next = !useFavoriteProviders;
    setUseFavoriteProviders?.(next);
    if (next && providerId) {
      setProviderId("");
    }
  }

  function toggleGenre(id: number) {
    setGenreIds(genreIds.includes(id) ? genreIds.filter((g) => g !== id) : [...genreIds, id]);
  }

  const genreLabel =
    genreIds.length === 0
      ? "Tous les genres"
      : genreIds.length === 1
        ? genres.find((g) => g.id === genreIds[0])?.name || "1 genre"
        : `${genreIds.length} genres`;

  const sortLabel = sortField ? SORT_FIELDS.find((s) => s.value === sortField)?.label : undefined;

  return (
    <div className={styles.bar}>
      <div className={styles.segmented} role="tablist" aria-label="Type">
        <button
          type="button"
          className={mediaType === "movie" ? styles.segActive : ""}
          onClick={() => setMediaType("movie")}
        >
          Films
        </button>
        <button
          type="button"
          className={mediaType === "tv" ? styles.segActive : ""}
          onClick={() => setMediaType("tv")}
        >
          Séries
        </button>
      </div>

      <Dropdown label={genreLabel} active={genreIds.length > 0}>
        <div className={dropdownStyles.head}>Filtrer par genre</div>
        {genres.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`${dropdownStyles.option} ${genreIds.includes(g.id) ? dropdownStyles.optionOn : ""}`}
            role="menuitemcheckbox"
            aria-checked={genreIds.includes(g.id)}
            onClick={() => toggleGenre(g.id)}
          >
            <span className={dropdownStyles.check}>{CHECK_SVG}</span> {g.name}
          </button>
        ))}
      </Dropdown>

      <select
        value={providerId}
        onChange={(e) => onProviderSelect(e.target.value)}
        className={styles.select}
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
        <Chip
          active={useFavoriteProviders}
          onClick={onToggleFavorites}
          title="Filtrer sur les plateformes que tu as cochées dans ton profil"
        >
          🎯 Mes plateformes
        </Chip>
      )}

      {setSortField && sortField && (
        <Dropdown label={<>Trier&nbsp;: {sortLabel}</>} align="right">
          <div className={dropdownStyles.head}>Trier par</div>
          {SORT_FIELDS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`${dropdownStyles.option} ${sortField === s.value ? dropdownStyles.optionOn : ""}`}
              role="menuitemradio"
              aria-checked={sortField === s.value}
              onClick={() => setSortField(s.value)}
            >
              <span className={dropdownStyles.radio} /> {s.label}
            </button>
          ))}
          {setSortDirection && sortDirection && (
            <button
              type="button"
              className={dropdownStyles.option}
              onClick={() => setSortDirection(sortDirection === "desc" ? "asc" : "desc")}
            >
              {sortDirection === "desc" ? "↓ Décroissant" : "↑ Croissant"} (cliquer pour inverser)
            </button>
          )}
        </Dropdown>
      )}
    </div>
  );
}
