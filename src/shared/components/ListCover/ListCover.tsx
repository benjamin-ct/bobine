import { posterUrl } from "../../../core/api/tmdb.ts";
import { posterAccentFromGenres } from "../../lib/posterAccent.ts";
import posterStyles from "../../styles/posterAccents.module.css";
import type { LibraryItem } from "../../../core/types/library.ts";
import Icon from "../Icon/Icon.tsx";
import styles from "./ListCover.module.css";

interface Props {
  /** Items de la liste, dans leur ordre : seuls les 3 premiers sont montrés. */
  items: LibraryItem[];
  /** `lg` : en-tête de la page de liste publique. */
  size?: "md" | "lg";
  className?: string;
}

const COVER_SIZE = 3;

// Couverture en éventail d'une liste perso : ses 3 premières affiches (1 ou
// 2 si la liste est plus courte, une icône si elle est vide). Décorative.
export default function ListCover({ items, size = "md", className = "" }: Props) {
  const cover = items.slice(0, COVER_SIZE);
  return (
    <div
      className={`${styles.cover} ${styles[size]} ${styles[`cover${cover.length}`]} ${className}`}
      aria-hidden
    >
      {cover.length === 0 ? (
        <span className={styles.coverEmpty}>
          <Icon name="list" size={size === "lg" ? 34 : 26} />
        </span>
      ) : (
        cover.map((item) => {
          const key = `${item.mediaType}:${item.id}`;
          const src = posterUrl(item.posterPath, "w185");
          return (
            <span key={key} className={styles.coverCard}>
              {src ? (
                <img src={src} alt="" />
              ) : (
                <span className={posterStyles[posterAccentFromGenres(item.genreIds, key)]} />
              )}
            </span>
          );
        })
      )}
    </div>
  );
}
