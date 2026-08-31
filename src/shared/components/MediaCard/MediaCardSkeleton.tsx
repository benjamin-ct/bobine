import skeletonStyles from "../../styles/skeleton.module.css";
import cardStyles from "./MediaCard.module.css";
import styles from "./MediaCardSkeleton.module.css";

// Occupe la même place qu'une MediaCard (mêmes classes .card/.poster/.info)
// pendant le premier chargement d'une grille, à la place du bloc
// "Chargement…" — même esprit que DetailSkeleton pour la fiche détail.
export default function MediaCardSkeleton() {
  return (
    <div className={cardStyles.card}>
      <div className={`${cardStyles.poster} ${skeletonStyles.block}`} />
      <div className={cardStyles.info}>
        <div className={`${skeletonStyles.block} ${styles.barTitle}`} />
        <div className={`${skeletonStyles.block} ${styles.barYear}`} />
      </div>
    </div>
  );
}
