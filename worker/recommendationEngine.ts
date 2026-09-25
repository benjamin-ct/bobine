// Logique PURE du moteur de recommandation "Pour toi" (voir carte Trello
// "Recommandations personnalisées « Pour toi » (algo maison v1)") : profil de
// goûts (genres/décennies), scoring des candidats, diversité, tirage
// pondéré. Aucune dépendance à D1/TMDB/`fetch` ici — testable sous Node natif
// (voir scripts/verify-recommendations.ts), sur le même modèle que
// src/core/api/movieMeta.ts. worker/recommendations.ts fait le pont avec D1
// et TMDB et appelle ces fonctions.

export interface SignalItem {
  genreIds: number[];
  /** Année de sortie, ou null si inconnue (jamais utilisée pour l'affinité décennie). */
  year: number | null;
  /** Poids du signal, déjà centré : positif = apprécié, négatif = rejeté. */
  signal: number;
}

export interface AffinityScore {
  score: number;
  positiveCount: number;
  negativeCount: number;
}

export interface TasteProfile {
  genreScores: Map<number, AffinityScore>;
  decadeScores: Map<number, AffinityScore>;
  /** Genres appris comme rejetés (seuil d'exclusion atteint), en plus des genres
   * explicitement exclus par l'utilisateur (ceux-ci restent gérés à part : ils
   * s'appliquent même sans historique). */
  learnedExcludedGenreIds: number[];
  /** Nombre de titres vus/notés ayant produit un signal — sert au cold start. */
  ratedOrWatchedCount: number;
}

// Rating sur 10 (voir StatsPanel.tsx, "★ x/10"). Centré sur 5 : une note de
// 10 vaut +1, une note de 0 vaut -1, 5 vaut 0.
export function ratingToSignal(rating: number): number {
  return Math.max(-1, Math.min(1, (rating - 5) / 5));
}

export const SIGNAL_WATCHED_NO_RATING = 0.3;
export const SIGNAL_WATCHLIST = 0.5;

// Seuil d'exclusion : au moins ce nombre de titres rejetés dans ce genre,
// et JAMAIS un titre apprécié dans ce même genre (voir description du
// ticket : "Minimum de données avant d'appliquer un seuil d'exclusion").
export const EXCLUSION_MIN_NEGATIVE_COUNT = 5;

// Minimum de titres notés/vus avant de sortir du cold start (voir ticket :
// "sous ~5 titres notés/vus, retourner des titres populaires").
export const COLD_START_MIN_ITEMS = 5;

function yearToDecade(year: number): number {
  return Math.floor(year / 10) * 10;
}

function addAffinity(map: Map<number, AffinityScore>, key: number, signal: number): void {
  const existing = map.get(key) || { score: 0, positiveCount: 0, negativeCount: 0 };
  existing.score += signal;
  if (signal > 0) {
    existing.positiveCount += 1;
  } else if (signal < 0) {
    existing.negativeCount += 1;
  }
  map.set(key, existing);
}

// Lissage entre décennies voisines (voir ticket : "pour éviter les effets de
// bord") : chaque décennie récupère une part du score de ses voisines
// immédiates, seulement si celles-ci ont des données (sinon rien à lisser).
function smoothDecadeScores(raw: Map<number, AffinityScore>): Map<number, AffinityScore> {
  const smoothed = new Map<number, AffinityScore>();
  for (const [decade, own] of raw) {
    const prev = raw.get(decade - 10);
    const next = raw.get(decade + 10);
    let score = own.score * 0.6;
    let weight = 0.6;
    if (prev) {
      score += prev.score * 0.2;
      weight += 0.2;
    }
    if (next) {
      score += next.score * 0.2;
      weight += 0.2;
    }
    smoothed.set(decade, {
      score: score / weight,
      positiveCount: own.positiveCount,
      negativeCount: own.negativeCount,
    });
  }
  return smoothed;
}

export function buildTasteProfile(
  items: SignalItem[],
  explicitExcludedGenreIds: number[]
): TasteProfile {
  const explicitExcluded = new Set(explicitExcludedGenreIds);
  const genreScores = new Map<number, AffinityScore>();
  const decadeScoresRaw = new Map<number, AffinityScore>();
  let ratedOrWatchedCount = 0;

  for (const item of items) {
    ratedOrWatchedCount += 1;
    for (const genreId of item.genreIds) {
      if (explicitExcluded.has(genreId)) {
        continue; // exclusion explicite : ne participe même pas à l'apprentissage
      }
      addAffinity(genreScores, genreId, item.signal);
    }
    if (item.year != null) {
      addAffinity(decadeScoresRaw, yearToDecade(item.year), item.signal);
    }
  }

  const learnedExcludedGenreIds: number[] = [];
  for (const [genreId, affinity] of genreScores) {
    if (affinity.negativeCount >= EXCLUSION_MIN_NEGATIVE_COUNT && affinity.positiveCount === 0) {
      learnedExcludedGenreIds.push(genreId);
    }
  }

  return {
    genreScores,
    decadeScores: smoothDecadeScores(decadeScoresRaw),
    learnedExcludedGenreIds,
    ratedOrWatchedCount,
  };
}

export function isColdStart(profile: TasteProfile): boolean {
  return profile.ratedOrWatchedCount < COLD_START_MIN_ITEMS;
}

export function isGenreExcluded(
  profile: TasteProfile,
  explicitExcludedGenreIds: number[],
  genreId: number
): boolean {
  return (
    explicitExcludedGenreIds.includes(genreId) || profile.learnedExcludedGenreIds.includes(genreId)
  );
}

export interface ScoreReason {
  type: "genre" | "decade";
  genreId?: number;
  decade?: number;
  contribution: number;
}

export interface ScoredCandidate<T> {
  candidate: T;
  score: number;
  reason: ScoreReason | null;
}

// Petit bonus de notoriété TMDB, borné pour ne jamais dominer l'affinité de
// goûts (voir ticket : "petit bonus pour vote_average"). `voteCount` sous le
// plancher retourne 0 : trop peu d'avis pour être un signal fiable.
const MIN_VOTE_COUNT = 20;
const POPULARITY_BONUS_WEIGHT = 0.3;

export function popularityBonus(voteAverage: number, voteCount: number): number {
  if (voteCount < MIN_VOTE_COUNT) {
    return 0;
  }
  return (voteAverage / 10) * POPULARITY_BONUS_WEIGHT;
}

export function scoreCandidateGenresAndDecade(
  genreIds: number[],
  year: number | null,
  profile: TasteProfile
): { affinityScore: number; reason: ScoreReason | null } {
  let affinityScore = 0;
  let bestReason: ScoreReason | null = null;

  for (const genreId of genreIds) {
    const affinity = profile.genreScores.get(genreId);
    if (!affinity) {
      continue;
    }
    affinityScore += affinity.score;
    if (!bestReason || affinity.score > bestReason.contribution) {
      bestReason = { type: "genre", genreId, contribution: affinity.score };
    }
  }

  if (year != null) {
    const decade = yearToDecade(year);
    const affinity = profile.decadeScores.get(decade);
    if (affinity) {
      affinityScore += affinity.score;
      if (!bestReason || affinity.score > bestReason.contribution) {
        bestReason = { type: "decade", decade, contribution: affinity.score };
      }
    }
  }

  return { affinityScore, reason: bestReason };
}

// Diversité : pas plus de `maxConsecutive` candidats de suite partageant le
// même genre principal (voir ticket : "max 2-3 titres du même genre... à la
// suite"). Passe gloutonne sur une liste déjà triée par score : à chaque
// étape, prend le meilleur candidat restant qui ne viole pas la règle, ou à
// défaut le meilleur tout court (mieux vaut une petite répétition qu'un
// candidat nettement moins bon écarté pour rien).
export function diversify<T>(
  sorted: Array<{ item: T; primaryGenreId: number | null }>,
  maxConsecutive: number
): T[] {
  const remaining = [...sorted];
  const result: T[] = [];
  let streakGenre: number | null = null;
  let streakLength = 0;

  while (remaining.length > 0) {
    let pickIndex = remaining.findIndex(
      (entry) =>
        entry.primaryGenreId === null ||
        entry.primaryGenreId !== streakGenre ||
        streakLength < maxConsecutive
    );
    if (pickIndex === -1) {
      pickIndex = 0;
    }
    const [picked] = remaining.splice(pickIndex, 1);
    result.push(picked.item);
    if (picked.primaryGenreId !== null && picked.primaryGenreId === streakGenre) {
      streakLength += 1;
    } else {
      streakGenre = picked.primaryGenreId;
      streakLength = 1;
    }
  }
  return result;
}

// Tirage pondéré (roulette wheel) : `rng` injectable (doit renvoyer une
// valeur dans [0, 1)) pour un test déterministe — voir
// scripts/verify-recommendations.ts. Poids <= 0 traités comme un tout petit
// poids résiduel plutôt que 0 : garde une petite part d'aléa/découverte même
// pour un candidat mal noté par le profil (voir ticket : "garder une petite
// part d'aléa").
const MIN_WEIGHT = 0.01;

export function weightedPick<T>(items: T[], weightFn: (item: T) => number, rng: () => number): T {
  if (items.length === 0) {
    throw new Error("weightedPick: liste vide.");
  }
  const weights = items.map((item) => Math.max(MIN_WEIGHT, weightFn(item)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let target = rng() * total;
  for (let i = 0; i < items.length; i++) {
    target -= weights[i];
    if (target <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}
