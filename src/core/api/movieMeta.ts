// Fonctions PURES de dérivation de métadonnées film/série (durée estimée,
// date de sortie ciné FR, formatage de date, statut "au cinéma"). Isolées
// à dessein : aucune dépendance à `import.meta.env` ni au réseau, donc
// directement testables sous Node natif (voir scripts/verify-movie-meta.ts)
// et importables par le client Vite, qui les réexporte depuis tmdb.ts pour
// ne pas changer les points d'import existants. Une seule source de
// vérité, aucune copie à synchroniser.
import type { MediaDetails, MediaType, ReleaseDatesResponse } from "../types/tmdb.ts";

/** Sous-ensemble de MediaDetails réellement consommé ici — accepte aussi un
 * objet partiel/`null` (fiche pas encore chargée, ou test avec des données
 * incomplètes), voir les appels de MediaCard/Detail/Random. */
type RuntimeSource = Pick<
  MediaDetails,
  "runtime" | "episode_run_time" | "number_of_episodes"
> | null;

// Durée totale estimée en minutes. Film : `runtime` tel quel. Série : pas
// de durée globale chez TMDB, on l'estime en durée d'un épisode ×
// nombre d'épisodes. `null` si l'information manque (repli côté appelant).
export function estimateRuntimeMinutes(
  details: RuntimeSource,
  mediaType: MediaType
): number | null {
  if (mediaType === "movie") {
    return details?.runtime || null;
  }
  const perEpisode = details?.episode_run_time?.[0];
  const episodeCount = details?.number_of_episodes;
  if (!perEpisode || !episodeCount) {
    return null;
  }
  return perEpisode * episodeCount;
}

// TMDB ne donne pas de date de fin d'exploitation en salle : on considère
// un film "encore au cinéma" s'il est sorti il y a moins de 6 semaines.
export const THEATRICAL_WINDOW_DAYS = 42;

// Type de sortie TMDB : 3 = sortie nationale en salles, 2 = sortie limitée
// en salles. On préfère la sortie nationale (la plus ancienne s'il y en a
// plusieurs) ; UNIQUEMENT à défaut, la sortie limitée (la plus ancienne).
// NB : on choisit d'abord le TYPE, puis la date la plus ancienne DANS ce
// type — et non la date la plus ancienne tous types confondus, sinon une
// sortie limitée antérieure masquerait la sortie nationale qu'on veut
// privilégier.
function extractFrenchTheatricalDate(
  releaseDatesResponse: ReleaseDatesResponse | undefined
): string | null {
  const fr = releaseDatesResponse?.results?.find((r) => r.iso_3166_1 === "FR");
  if (!fr) {
    return null;
  }
  const earliestOfType = (type: number) =>
    (fr.release_dates || [])
      .filter((rd) => rd.type === type)
      .sort((a, b) => a.release_date.localeCompare(b.release_date))[0];
  const theatrical = earliestOfType(3) || earliestOfType(2);
  return theatrical ? theatrical.release_date.slice(0, 10) : null;
}

// Pour la fiche détail : `details` vient de getDetails(), qui inclut déjà
// release_dates (pas d'appel réseau supplémentaire).
export function getFrenchTheatricalDateFromDetails(
  details: Pick<MediaDetails, "release_dates"> | null | undefined
): string | null {
  return extractFrenchTheatricalDate(details?.release_dates);
}

// Date complète lisible (ex. "12 septembre 2026"), films et séries — plus
// précis que l'année seule affichée jusqu'ici sur les cartes/lignes de
// liste. `null` si la date est absente ou invalide (repli sur l'année seule
// côté appelant).
export function formatFullDate(dateString: string | null | undefined): string | null {
  if (!dateString) {
    return null;
  }
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export type TheatricalStatus = "upcoming" | "in_theaters" | "past";

// "upcoming" (pas encore sorti), "in_theaters" (sorti il y a moins de
// THEATRICAL_WINDOW_DAYS), "past" (sorti plus tôt), ou null si aucune date
// de sortie cinéma FR n'est connue pour ce titre (VOD/streaming direct,
// film jamais distribué en salle en France...). Utilisé sur la fiche détail
// (une seule date, déjà connue précisément via extractFrenchTheatricalDate).
export function theatricalStatusFromDate(
  dateString: string | null | undefined
): TheatricalStatus | null {
  if (!dateString) {
    return null;
  }
  const diffDays = (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) {
    return "upcoming";
  }
  if (diffDays <= THEATRICAL_WINDOW_DAYS) {
    return "in_theaters";
  }
  return "past";
}
