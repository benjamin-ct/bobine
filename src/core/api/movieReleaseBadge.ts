// Logique PURE du badge "Vient de sortir" / "Prochainement" pour un FILM
// suivi (watchlist), pendant vu côté films de seriesEpisodeBadge.ts (séries).
// Isolée à dessein pour les mêmes raisons : ni `import.meta.env` ni API
// navigateur, importable tel quel par Node (scripts/verify-*) et le client
// Vite.
//
// Contrairement à `getUpcomingMovieRelease` (releaseBadge.ts), qui choisit
// le type de sortie le plus "définitif" (cinéma en priorité) pour annoncer
// UNE prochaine sortie à venir, ce module cherche la sortie INITIALE réelle
// du film : la toute première date à laquelle il devient disponible au
// public, quel que soit le canal — cinéma, plateforme, ou même sortie
// directement vidéo (DTV) si c'est là sa toute première disponibilité.
// Décision produit (carte Trello badge-episodes, 2026-09-17) : "on parle de
// sortie initiale [...] même DVD si c'est du DTV, puisque sinon il sera
// considéré déjà sorti".
//
// Un film est par nature un événement de sortie unique (pas de saisons
// récurrentes comme une série) : on retient donc les mêmes fenêtres que le
// cas "nouvelle série" de seriesEpisodeBadge.ts (30 jours avant / 14 jours
// après), plutôt que de dupliquer une échelle de seuils différente.
import type { ReleaseDateEntry, ReleaseDatesResponse } from "../types/tmdb.ts";

export type MovieReleaseBadgeKind = "just_released" | "upcoming";

export interface MovieReleaseBadge {
  kind: MovieReleaseBadgeKind;
  label: string;
  date: string;
}

const JUST_RELEASED_WINDOW_DAYS = 14;
const UPCOMING_WINDOW_DAYS = 30;

// Types TMDB représentant une disponibilité publique réelle (voir
// ReleaseDateEntry) — 1 (avant-première) exclu, ce n'est pas une sortie
// grand public.
const PUBLIC_RELEASE_TYPES = [2, 3, 4, 5, 6];

// Même raison que dans seriesEpisodeBadge.ts : comparaison de dates
// calendaires en chaîne, pas d'objet Date, pour éviter tout décalage de
// fuseau horaire.
function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// Date de sortie initiale : la plus ancienne entrée connue (tous types
// publics confondus) pour la région cible. Si TMDB n'a aucune entrée pour
// cette région précisément, repli sur `primaryReleaseDate` (déjà connu côté
// appelant, ex. item.date dans la watchlist) plutôt que de regarder toutes
// les régions — contrairement à `getUpcomingMovieRelease`, on n'a pas
// besoin ici de choisir un type de sortie à afficher, juste une date de
// référence pour le calcul de fenêtre.
function initialReleaseDate(
  releaseDatesResponse: ReleaseDatesResponse | null | undefined,
  region: string,
  primaryReleaseDate: string | null
): string | null {
  const results = releaseDatesResponse?.results || [];
  const regionEntry = results.find((r) => r.iso_3166_1 === region);
  const entries: ReleaseDateEntry[] = (regionEntry?.release_dates || []).filter((rd) =>
    PUBLIC_RELEASE_TYPES.includes(rd.type)
  );
  if (entries.length > 0) {
    return entries.map((rd) => rd.release_date.slice(0, 10)).sort()[0];
  }
  return primaryReleaseDate ? primaryReleaseDate.slice(0, 10) : null;
}

export function getMovieReleaseBadge(
  releaseDatesResponse: ReleaseDatesResponse | null | undefined,
  region: string,
  primaryReleaseDate: string | null = null,
  todayIso: string = new Date().toISOString().slice(0, 10)
): MovieReleaseBadge | null {
  const date = initialReleaseDate(releaseDatesResponse, region, primaryReleaseDate);
  if (!date) {
    return null;
  }

  const daysSince = daysBetween(date, todayIso);
  if (daysSince >= 0 && daysSince <= JUST_RELEASED_WINDOW_DAYS) {
    return { kind: "just_released", label: "Vient de sortir", date };
  }

  const daysUntil = daysBetween(todayIso, date);
  if (daysUntil > 0 && daysUntil <= UPCOMING_WINDOW_DAYS) {
    return { kind: "upcoming", label: "Prochainement", date };
  }

  return null;
}
