import { Link } from "react-router-dom";
import { posterUrl } from "../../../core/api/tmdb.ts";
import { posterAccentFromGenres } from "../../lib/posterAccent.ts";
import type { LibraryItem } from "../../../core/types/library.ts";
import posterStyles from "../../styles/posterAccents.module.css";
import styles from "./ContinueWatchingRow.module.css";

interface ContinueWatchingRowProps {
  items: LibraryItem[];
}

/** "Reprendre" (Découvrir) / "En cours" (Ma liste) — séries entamées (au
 * moins un épisode coché, pas encore marquées "déjà vu"). Repris de la
 * maquette HTML. Le nombre total d'épisodes n'est connu qu'après un appel
 * TMDB dédié par série (voir modules/detail/EpisodeTracker) : cette rangée
 * reste volontairement légère (pas d'appel réseau par carte) et affiche le
 * nombre d'épisodes déjà vus plutôt qu'une barre de progression exacte. */
export default function ContinueWatchingRow({ items }: ContinueWatchingRowProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.row}>
      {items.map((item) => {
        const watchedCount = item.watchedEpisodes?.length || 0;
        const accentKey = posterAccentFromGenres(item.genreIds, `${item.mediaType}:${item.id}`);
        return (
          <Link
            key={`${item.mediaType}:${item.id}`}
            to={`/media/${item.mediaType}/${item.id}`}
            className={styles.card}
          >
            <div className={styles.thumb}>
              {item.posterPath ? (
                <img src={posterUrl(item.posterPath, "w185") ?? undefined} alt={item.title} />
              ) : (
                <div className={`${styles.thumbEmpty} ${posterStyles[accentKey]}`} />
              )}
            </div>
            <div className={styles.main}>
              <p className={styles.title} title={item.title}>
                {item.title}
              </p>
              <p className={styles.meta}>
                {watchedCount} épisode{watchedCount > 1 ? "s" : ""} vu{watchedCount > 1 ? "s" : ""}
              </p>
              <span className={styles.resume}>Reprendre →</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
