import { useState } from "react";
import { ratingTier, STAR_LABELS } from "../../lib/ratingTier.ts";
import styles from "./RatingStars.module.css";

const VALUES = Array.from({ length: 10 }, (_, i) => i + 1);

interface RatingStarsProps {
  value: number | null;
  onRate: (value: number | null) => void;
}

// Notation 0-10 avec aperçu au survol (chaque étoile montre son propre
// libellé pendant le survol, puis revient à la note choisie) et badge dont
// l'aspect (couleur/taille) suit le palier — repris de la maquette HTML,
// remplace l'ancien RatingInput (étoiles Unicode statiques).
export default function RatingStars({ value, onRate }: RatingStarsProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayValue = hovered ?? value ?? 0;
  const tier = ratingTier(displayValue || 1);

  return (
    <div className={styles.rate}>
      <div
        className={`${styles.stars} ${styles[`s-${tier.cls}`]}`}
        onMouseLeave={() => setHovered(null)}
      >
        {VALUES.map((n) => (
          <button
            key={n}
            type="button"
            className={`${styles.star} ${n <= displayValue ? styles.lit : ""}`}
            onMouseEnter={() => setHovered(n)}
            onClick={() => onRate(n === value ? null : n)}
            aria-label={`${n}/10 — ${STAR_LABELS[n - 1]}`}
            title={STAR_LABELS[n - 1]}
          >
            <svg viewBox="0 0 24 24">
              <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" />
            </svg>
          </button>
        ))}
      </div>
      <span className={styles.valueLabel}>
        {value ? (
          <>
            Votre note : <b>{value}</b>/10
          </>
        ) : (
          "Pas encore noté"
        )}
      </span>
      {value != null && (
        <span className={`${styles.badge} ${styles[`s-${ratingTier(value).cls}`]}`}>
          <span className={styles.dot} />
          {ratingTier(value).label}
        </span>
      )}
    </div>
  );
}
