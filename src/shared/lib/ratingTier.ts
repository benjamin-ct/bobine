// Paliers de note (0-10) — repris de la maquette HTML : la couleur/taille
// du badge suit 3 paliers, le texte affiché suit 10 niveaux (un par étoile).
// Fonction PURE (pas de useTranslation ici) : renvoie une clé i18n
// (namespace "ratingTier", voir locales/{fr,en}.json), à résoudre via t()
// côté composant appelant.
export type RatingTierClass = "low" | "mid" | "high";

export interface RatingTier {
  cls: RatingTierClass;
  labelKey: string;
}

export function ratingTier(n: number): RatingTier {
  if (n >= 8) {
    return { cls: "high", labelKey: "ratingTier.high" };
  }
  if (n >= 5) {
    return { cls: "mid", labelKey: "ratingTier.mid" };
  }
  return { cls: "low", labelKey: "ratingTier.low" };
}

export const STAR_LABEL_KEYS = [
  "ratingTier.star1",
  "ratingTier.star2",
  "ratingTier.star3",
  "ratingTier.star4",
  "ratingTier.star5",
  "ratingTier.star6",
  "ratingTier.star7",
  "ratingTier.star8",
  "ratingTier.star9",
  "ratingTier.star10",
] as const;
