import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getCollection, posterUrl } from "../../../core/api/tmdb.ts";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { posterAccentFromGenres } from "../../../shared/lib/posterAccent.ts";
import posterStyles from "../../../shared/styles/posterAccents.module.css";
import type { CollectionDetails } from "../../../core/types/tmdb.ts";
import styles from "./CollectionSection.module.css";

interface CollectionSectionProps {
  collectionId: number;
  currentMovieId: number;
}

// NOUVEAU (repris de la maquette HTML, absent du Projet A avant migration) :
// section "La saga" — les autres films de la même franchise
// (belongs_to_collection sur la fiche film), via un appel TMDB dédié
// /collection/{id} (voir getCollection, core/api/tmdb.ts). Rien à afficher
// pour la grande majorité des films (aucune collection) : ce composant
// n'est monté que si `details.belongs_to_collection` existe.
export default function CollectionSection({
  collectionId,
  currentMovieId,
}: CollectionSectionProps) {
  const { t } = useTranslation();
  const { isWatched, getRating } = useLibrary();
  const [collection, setCollection] = useState<CollectionDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getCollection(collectionId)
      .then((data) => {
        if (!cancelled) {
          setCollection(data);
          setStatus("success");
        }
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (status !== "success" || !collection) {
    return null;
  }

  if (!collection.parts.some((p) => p.id !== currentMovieId)) {
    return null;
  }

  // Tous les films de la saga, dans l'ordre de sortie (les films sans date,
  // pas encore annoncés, à la fin) — y compris celui de la fiche, marqué
  // « ce titre ».
  const parts = [...collection.parts].sort((a, b) =>
    (a.release_date || "9999").localeCompare(b.release_date || "9999")
  );
  const watchedCount = parts.filter((p) => isWatched("movie", p.id)).length;

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>
        {collection.name}{" "}
        <span className={styles.count}>
          {t("collection.watchedCount", { watched: watchedCount, count: parts.length })}
        </span>
      </h2>
      <ul className={styles.list}>
        {parts.map((part) => {
          const current = part.id === currentMovieId;
          const title = part.title || part.name || "";
          const rating = getRating("movie", part.id);
          const meta = [
            part.release_date?.slice(0, 4),
            current
              ? t("collection.thisTitle")
              : isWatched("movie", part.id)
                ? rating != null
                  ? t("collection.watchedRated", { rating })
                  : t("collection.watched")
                : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const content = (
            <>
              {part.poster_path ? (
                <img
                  src={posterUrl(part.poster_path, "w92") ?? undefined}
                  alt=""
                  className={styles.thumb}
                  loading="lazy"
                />
              ) : (
                <span
                  className={`${styles.thumb} ${posterStyles[posterAccentFromGenres(part.genre_ids, `movie:${part.id}`)]}`}
                />
              )}
              <span className={styles.text}>
                <span className={styles.partTitle}>{title}</span>
                {meta && <span className={styles.meta}>{meta}</span>}
              </span>
            </>
          );
          return (
            <li key={part.id}>
              {current ? (
                <div className={`${styles.part} ${styles.current}`} aria-current="page">
                  {content}
                </div>
              ) : (
                <Link to={`/media/movie/${part.id}`} className={styles.part}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
