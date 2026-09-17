import { Link } from "react-router-dom";
import { posterUrl } from "../../../core/api/tmdb.ts";
import { posterAccentFromGenres } from "../../lib/posterAccent.ts";
import { formatFullDate } from "../../../core/api/tmdb.ts";
import type { LibraryItem } from "../../../core/types/library.ts";
import posterStyles from "../../styles/posterAccents.module.css";
import styles from "./FeaturedMediaRow.module.css";

export interface FeaturedMediaEntry {
  item: LibraryItem;
  badge: { kind: "just_released" | "upcoming"; label: string; date: string };
}

interface FeaturedMediaRowProps {
  items: FeaturedMediaEntry[];
}

/** "Mise en avant" (Découvrir) : films et séries suivis dont une sortie
 * (épisode pour une série, sortie initiale pour un film) vient d'avoir lieu
 * ou arrive bientôt — voir useFeaturedSeries/useFeaturedMovies. Même
 * structure que ContinueWatchingRow, avec le badge à la place du décompte
 * d'épisodes vus. */
export default function FeaturedMediaRow({ items }: FeaturedMediaRowProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.row}>
      {items.map(({ item, badge }) => {
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
              <p
                className={`${styles.badge} ${badge.kind === "just_released" ? styles.badgeNew : styles.badgeUpcoming}`}
              >
                {badge.kind === "just_released" ? "🆕" : "📅"} {badge.label}
              </p>
              <span className={styles.date}>{formatFullDate(badge.date)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
