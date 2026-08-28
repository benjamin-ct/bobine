// Logique PURE du badge dynamique "Prochainement" (sélection du type de
// sortie à afficher, libellé, date). Isolée à dessein : ce module ne lit
// NI `import.meta.env.*` NI aucune API navigateur, il peut donc être
// importé tel quel par Node natif (scripts de vérification, voir
// scripts/verify-upcoming-badge.ts) ET par le client Vite (tmdb.ts le
// réexporte). Une seule source de vérité pour cette logique.
import type { MediaDetails, ReleaseDateEntry, ReleaseDatesResponse } from "../types/tmdb.ts";

// Repli si la région réelle du visiteur (voir RegionContext, /api/region)
// n'est pas encore connue ou n'a pas pu être déterminée.
export const DEFAULT_REGION = "FR";

export interface UpcomingRelease {
  label: string;
  date: string;
}

// Comparaison de dates calendaires en chaîne (YYYY-MM-DD), pas d'objet
// Date : évite tout décalage de fuseau horaire au moment de la
// comparaison (un `new Date("2026-08-17")` UTC minuit comparé à un `Date`
// local peut basculer d'un jour selon l'heure et le fuseau du visiteur).
function isStrictlyFutureDate(dateString: string | null | undefined, todayIso: string): boolean {
  if (!dateString) {
    return false;
  }
  return dateString.slice(0, 10) > todayIso;
}

function futureReleases(
  releaseDates: ReleaseDateEntry[] | undefined,
  todayIso: string
): ReleaseDateEntry[] {
  return (releaseDates || []).filter((rd) => isStrictlyFutureDate(rd.release_date, todayIso));
}

// Ordre de priorité explicite des types de sortie TMDB pour choisir LE
// type à afficher quand plusieurs sont connus : 3 (sortie nationale en
// salles) est le signal le plus définitif, puis 4 (numérique), 2 (sortie
// limitée en salles), 6 (télévision), 5 (physique — souvent tardif,
// signal le moins pertinent comme sortie "principale" à annoncer).
const RELEASE_TYPE_PRIORITY = [3, 4, 2, 6, 5];

// Libellé de badge pour un type de sortie retenu. Seul le type 4
// (numérique) regarde `note` : c'est le seul type où TMDB y place de
// façon fiable un nom de service exploitable (Netflix, Prime Video...)
// quand il est renseigné — sur les autres types, `note` est généralement
// vide ou un texte générique sans valeur ajoutée pour le badge.
function labelForRelease(type: number, note: string | undefined): string | null {
  if (type === 2 || type === 3) {
    return "Cinéma";
  }
  if (type === 4) {
    return note?.trim() || "Sortie numérique";
  }
  if (type === 5) {
    return "Sortie physique";
  }
  if (type === 6) {
    return "Télévision";
  }
  return null;
}

interface PickedRelease {
  type: number;
  entries: ReleaseDateEntry[];
}

// Parmi un lot de release_dates, sélectionne le type le plus prioritaire
// réellement présent (futur, type 1/avant-première toujours écarté — pas
// une sortie grand public), puis toutes ses entrées triées par date
// croissante. `null` si rien d'exploitable dans ce lot.
function pickReleaseByTypePriority(
  releaseDates: ReleaseDateEntry[] | undefined,
  todayIso: string
): PickedRelease | null {
  const candidates = futureReleases(releaseDates, todayIso).filter((rd) => rd.type !== 1);
  for (const type of RELEASE_TYPE_PRIORITY) {
    const ofType = candidates.filter((rd) => rd.type === type);
    if (ofType.length > 0) {
      return { type, entries: ofType.sort((a, b) => a.release_date.localeCompare(b.release_date)) };
    }
  }
  return null;
}

// Film : prochaine sortie/diffusion strictement future, avec son libellé.
// `releaseDatesResponse` : résultat brut de getMovieReleaseDates().
// `primaryReleaseDate` : date de sortie déjà connue côté appelant
// (item.release_date — la même donnée que /search/movie ou
// /discover/movie renvoient), utilisée UNIQUEMENT comme filtre de
// pertinence quand la région cible n'a pas d'entrée dans release_dates.
//
// 1-2. Région cible trouvée dans release_dates : parmi ses sorties
//    publiques futures, on retient le type présent le plus prioritaire
//    (RELEASE_TYPE_PRIORITY), puis la date la plus proche parmi les
//    sorties de ce type — cette date, tirée de /release_dates, est celle
//    affichée.
// 3. Région cible absente (TMDB n'a rien pour ce pays précisément,
//    fréquent pour un film pas encore distribué en France) : le film
//    n'est retenu que si `primaryReleaseDate` est lui-même strictement
//    futur (garde-fou de pertinence : un film dont la sortie principale
//    est déjà passée n'a rien à faire dans "Prochainement"). On analyse
//    alors les sorties publiques futures connues toutes régions
//    confondues, on retient le type le plus prioritaire présent, et la
//    date affichée est celle de l'entrée la plus proche DE CE TYPE — la
//    même règle que pour la région trouvée. Le libellé et la date
//    proviennent ainsi toujours de la MÊME entrée, donc restent cohérents
//    entre eux (un badge "Cinéma" affiche bien la date de la sortie ciné,
//    pas celle d'un autre type comme une avant-première payante).
//
// Ne s'appuie jamais sur /watch/providers (disponibilité actuelle, pas
// sortie annoncée — voir MediaCard). Renvoie `null` si rien d'exploitable
// n'est trouvé (à charge de l'appelant de retomber sur un repli).
export function getUpcomingMovieRelease(
  releaseDatesResponse: ReleaseDatesResponse,
  region: string = DEFAULT_REGION,
  primaryReleaseDate: string | null = null
): UpcomingRelease | null {
  const todayIso = new Date().toISOString().slice(0, 10);
  const results = releaseDatesResponse?.results || [];
  const regionEntry = results.find((r) => r.iso_3166_1 === region);

  if (regionEntry) {
    const picked = pickReleaseByTypePriority(regionEntry.release_dates, todayIso);
    if (!picked) {
      return null;
    }
    const next = picked.entries[0];
    const label = labelForRelease(picked.type, next.note);
    return label ? { label, date: next.release_date.slice(0, 10) } : null;
  }

  if (!isStrictlyFutureDate(primaryReleaseDate, todayIso)) {
    return null;
  }

  const allReleaseDates = results.flatMap((r) => r.release_dates || []);
  const picked = pickReleaseByTypePriority(allReleaseDates, todayIso);
  if (!picked) {
    return null;
  }
  const next = picked.entries[0];
  const label = labelForRelease(picked.type, next.note);
  return label ? { label, date: next.release_date.slice(0, 10) } : null;
}

// Série : le diffuseur de première diffusion (networks[].name — peut être
// une plateforme de streaming comme Netflix/Disney+ ou une chaîne
// classique comme ABC/BBC, TMDB ne distingue pas les deux dans ce champ,
// et il n'y a pas lieu de le faire ici non plus : le badge représente le
// canal de diffusion connu, quelle que soit sa nature). Jamais déduit de
// /watch/providers, qui reflète la disponibilité actuelle, pas la
// diffusion à venir. "Série à venir" si aucun network connu — jamais
// d'invention de plateforme. `details` : résultat de getDetails("tv", id).
export function getUpcomingSeriesRelease(
  details: Pick<MediaDetails, "networks" | "first_air_date"> | null | undefined
): UpcomingRelease {
  const label = details?.networks?.find((n) => n?.name)?.name || "Série à venir";
  const date = details?.first_air_date || "";
  return { label, date };
}
