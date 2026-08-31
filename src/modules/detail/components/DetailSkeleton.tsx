import { posterUrl } from "../../../core/api/tmdb.ts";
import type { MediaPreview } from "../../../shared/lib/mediaPreviewCache.ts";
import gridStyles from "../../../shared/styles/mediaGrid.module.css";
import pageStyles from "../DetailPage.module.css";
import styles from "./DetailSkeleton.module.css";

const CAST_PLACEHOLDER_COUNT = 6;

interface DetailSkeletonProps {
  preview: MediaPreview | null;
}

// Remplace l'ancien écran "Chargement…" plein écran : préaffiche affiche
// / titre / date si on les connaît déjà (voir mediaPreviewCache — venant de
// la grille ou de la recherche d'où on arrive), et affiche des blocs
// grisés à la place du reste le temps que l'appel /movie ou /tv réponde.
export default function DetailSkeleton({ preview }: DetailSkeletonProps) {
  return (
    <>
      <div className={`${pageStyles.hero} ${styles.hero}`}>
        <div className={pageStyles.heroOverlay} />
        <div className={pageStyles.heroInner}>
          <div className={pageStyles.posterWrap}>
            {preview?.posterPath ? (
              <img
                src={posterUrl(preview.posterPath, "w342") ?? undefined}
                alt={preview.title}
                className={pageStyles.poster}
              />
            ) : (
              <div className={`${pageStyles.poster} ${styles.block}`} />
            )}
          </div>
          <div className={pageStyles.info}>
            {preview?.title ? (
              <h1 className={pageStyles.title}>
                {preview.title}{" "}
                {preview.date && (
                  <span className={pageStyles.year}>({preview.date.slice(0, 4)})</span>
                )}
              </h1>
            ) : (
              <div className={`${styles.block} ${styles.barTitle}`} />
            )}
            <div className={`${styles.block} ${styles.barMeta}`} />
            <div className={`${styles.block} ${styles.barLine}`} />
            <div className={`${styles.block} ${styles.barLine}`} />
            <div className={`${styles.block} ${styles.barLineShort}`} />
            <div className={styles.actionsSkeleton}>
              <div className={`${styles.block} ${styles.pill}`} />
              <div className={`${styles.block} ${styles.pill}`} />
            </div>
          </div>
        </div>
      </div>

      <section className={pageStyles.section}>
        <div className={`${styles.block} ${styles.sectionTitle}`} />
        <div className={styles.providersSkeleton}>
          <div className={`${styles.block} ${styles.providerLogo}`} />
          <div className={`${styles.block} ${styles.providerLogo}`} />
          <div className={`${styles.block} ${styles.providerLogo}`} />
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={`${styles.block} ${styles.sectionTitle}`} />
        <div className={gridStyles.personGrid}>
          {Array.from({ length: CAST_PLACEHOLDER_COUNT }, (_, i) => (
            <div key={i} className={styles.personSkeleton}>
              <div className={`${styles.block} ${styles.avatar}`} />
              <div className={`${styles.block} ${styles.barLine}`} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
