// Paliers de note (0-10) — repris de la maquette HTML : la couleur/taille
// du badge suit 3 paliers, le texte affiché suit 10 niveaux (un par étoile).
export type RatingTierClass = "low" | "mid" | "high";

export interface RatingTier {
  cls: RatingTierClass;
  label: string;
}

export function ratingTier(n: number): RatingTier {
  if (n >= 8) {
    return { cls: "high", label: "Coup de cœur" };
  }
  if (n >= 5) {
    return { cls: "mid", label: "Recommandé" };
  }
  return { cls: "low", label: "Mitigé" };
}

export const STAR_LABELS = [
  "À fuir",
  "Raté",
  "Faible",
  "Bof",
  "Passable",
  "Correct",
  "Bien",
  "Très bien",
  "Excellent",
  "Chef-d'œuvre",
] as const;
