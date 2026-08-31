import skeletonStyles from "../../../shared/styles/skeleton.module.css";
import pageStyles from "../ComingSoonPage.module.css";
import styles from "./ComingSoonSkeleton.module.css";

const ITEM_PLACEHOLDER_COUNT = 8;

// Occupe la même place que la timeline (mêmes classes .timeline/.item que
// ComingSoonPage) pendant le premier chargement, à la place du bloc
// "Chargement…" — même esprit que DetailSkeleton pour la fiche détail.
export default function ComingSoonSkeleton() {
  return (
    <div className={pageStyles.timeline}>
      {Array.from({ length: ITEM_PLACEHOLDER_COUNT }, (_, i) => (
        <div key={i} className={pageStyles.item}>
          <div className={`${skeletonStyles.block} ${styles.date}`} />
          <div className={`${skeletonStyles.block} ${styles.thumb}`} />
          <div className={styles.body}>
            <div className={`${skeletonStyles.block} ${styles.barTitle}`} />
            <div className={`${skeletonStyles.block} ${styles.barSub}`} />
          </div>
          <div className={`${skeletonStyles.block} ${styles.bell}`} />
        </div>
      ))}
    </div>
  );
}
