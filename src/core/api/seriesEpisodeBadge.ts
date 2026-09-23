// Logique PURE du badge "Vient de sortir" / "Prochainement" sur les
// épisodes de séries (ticket : badge sur les séries suivies annonçant un
// épisode qui vient de sortir ou qui arrive bientôt). Isolée à dessein,
// mêmes raisons que releaseBadge.ts/movieMeta.ts : ni `import.meta.env` ni
// API navigateur, importable tel quel par Node (voir
// scripts/verify-series-episode-badge.ts) et par le client Vite.
//
// S'appuie principalement sur `next_episode_to_air`/`last_episode_to_air`
// (TMDB /tv/{id}, champs de base toujours présents, aucun appel
// supplémentaire par saison nécessaire) plutôt que de reparcourir
// seasons/episodes comme useResumableSeries : ces deux champs donnent déjà,
// pour n'importe quelle série, le dernier épisode diffusé et le prochain
// annoncé.
//
// Repli sur `first_air_date` (même champ que getUpcomingSeriesRelease dans
// releaseBadge.ts) pour une série jamais diffusée : TMDB ne remplit
// `next_episode_to_air` que tardivement pour les séries encore "In
// Production"/"Planned", parfois même à quelques jours de la sortie,
// alors que `first_air_date` est renseigné dès l'annonce officielle.
//
// Même repli, mais au niveau saison (`seasons[].air_date`), pour une série
// déjà diffusée qui revient pour une nouvelle saison annoncée : le même
// retard TMDB s'applique à `next_episode_to_air` dans ce cas (une série
// renouvelée n'a pas de first_air_date à venir puisqu'elle a déjà commencé).
//
// Fenêtres et règles produit (issues du ticket, réponse du 2026-09-14) :
//   "prochainement" :
//     - nouvelle série pas encore sortie (aucun last_episode_to_air) : 1 mois avant
//     - série déjà sortie, nouvelle saison (next episode_number === 1) : 2 semaines avant
//     - série déjà sortie, saison en cours : 1 semaine avant l'épisode
//   "vient de sortir" :
//     - nouvelle série (dernier épisode diffusé = S1E1) : 2 semaines après
//     - nouvelle saison ou nouvel épisode : 1 semaine après
// En cas de chevauchement (un épisode vient de sortir ET le suivant est
// déjà dans sa fenêtre "prochainement"), "vient de sortir" est prioritaire
// : c'est l'info actionnable immédiatement (contenu disponible maintenant).
import type { MediaDetails } from "../types/tmdb.ts";

export type SeriesEpisodeBadgeKind = "just_released" | "upcoming";

export interface SeriesEpisodeBadge {
  kind: SeriesEpisodeBadgeKind;
  label: string;
  date: string;
  /** Épisode déclencheur du badge (celui qui vient de sortir, ou le premier
   * de la saison/série à venir) — sert à vérifier côté appelant (voir
   * useFeaturedSeries) si l'utilisateur l'a déjà marqué comme vu, auquel cas
   * le badge ne doit plus être affiché même si la fenêtre temporelle est
   * encore valide. */
  seasonNumber: number;
  episodeNumber: number;
}

const JUST_RELEASED_WINDOW_NEW_SERIES_DAYS = 14;
const JUST_RELEASED_WINDOW_DAYS = 7;
const UPCOMING_WINDOW_NEW_SERIES_DAYS = 30;
const UPCOMING_WINDOW_NEW_SEASON_DAYS = 14;
const UPCOMING_WINDOW_CURRENT_SEASON_DAYS = 7;

type EpisodeBadgeSource = Pick<
  MediaDetails,
  "next_episode_to_air" | "last_episode_to_air" | "first_air_date" | "seasons"
>;

// Différence en jours calendaires entre deux dates YYYY-MM-DD, comparées en
// UTC minuit (même raison que isStrictlyFutureDate dans releaseBadge.ts :
// éviter tout décalage de fuseau horaire).
function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function getSeriesEpisodeBadge(
  details: EpisodeBadgeSource | null | undefined,
  todayIso: string = new Date().toISOString().slice(0, 10)
): SeriesEpisodeBadge | null {
  const last = details?.last_episode_to_air;
  const next = details?.next_episode_to_air;

  if (last?.air_date) {
    const lastDate = last.air_date.slice(0, 10);
    const daysSince = daysBetween(lastDate, todayIso);
    if (daysSince >= 0) {
      const isNewSeries = last.season_number === 1 && last.episode_number === 1;
      const window = isNewSeries ? JUST_RELEASED_WINDOW_NEW_SERIES_DAYS : JUST_RELEASED_WINDOW_DAYS;
      if (daysSince <= window) {
        return {
          kind: "just_released",
          label: "Vient de sortir",
          date: lastDate,
          seasonNumber: last.season_number,
          episodeNumber: last.episode_number,
        };
      }
    }
  }

  if (next?.air_date) {
    const nextDate = next.air_date.slice(0, 10);
    const daysUntil = daysBetween(todayIso, nextDate);
    if (daysUntil >= 0) {
      const isNewSeriesPremiere = !last && next.season_number === 1 && next.episode_number === 1;
      const isNewSeasonPremiere = !isNewSeriesPremiere && next.episode_number === 1;
      const window = isNewSeriesPremiere
        ? UPCOMING_WINDOW_NEW_SERIES_DAYS
        : isNewSeasonPremiere
          ? UPCOMING_WINDOW_NEW_SEASON_DAYS
          : UPCOMING_WINDOW_CURRENT_SEASON_DAYS;
      if (daysUntil <= window) {
        return {
          kind: "upcoming",
          label: "Prochainement",
          date: nextDate,
          seasonNumber: next.season_number,
          episodeNumber: next.episode_number,
        };
      }
    }
  }

  // Série déjà diffusée (last présent) dont TMDB n'a pas encore renseigné
  // next_episode_to_air pour la saison suivante : repli sur la date de
  // première de la prochaine saison connue dans `seasons`, avec la même
  // fenêtre que "nouvelle saison" ci-dessus.
  if (!next?.air_date && last?.air_date && details?.seasons) {
    const upcomingSeason = details.seasons
      .filter((s) => s.season_number > last.season_number && s.air_date)
      .sort((a, b) => a.season_number - b.season_number)[0];
    if (upcomingSeason?.air_date) {
      const seasonDate = upcomingSeason.air_date.slice(0, 10);
      const daysUntil = daysBetween(todayIso, seasonDate);
      if (daysUntil >= 0 && daysUntil <= UPCOMING_WINDOW_NEW_SEASON_DAYS) {
        return {
          kind: "upcoming",
          label: "Prochainement",
          date: seasonDate,
          seasonNumber: upcomingSeason.season_number,
          // Pas de détail épisode par épisode dans `seasons[]` (juste la
          // saison) : la nouvelle saison n'a par définition aucun épisode
          // vu, donc l'épisode 1 par défaut suffit pour le contrôle "déjà
          // vu" côté useFeaturedSeries.
          episodeNumber: 1,
        };
      }
    }
  }

  // Aucune donnée épisode par épisode (série jamais diffusée, next/last
  // absents) : repli sur first_air_date, avec la même fenêtre que "nouvelle
  // série pas encore sortie" ci-dessus.
  if (!last?.air_date && !next?.air_date && details?.first_air_date) {
    const premiereDate = details.first_air_date.slice(0, 10);
    const daysUntil = daysBetween(todayIso, premiereDate);
    if (daysUntil >= 0 && daysUntil <= UPCOMING_WINDOW_NEW_SERIES_DAYS) {
      return {
        kind: "upcoming",
        label: "Prochainement",
        date: premiereDate,
        seasonNumber: 1,
        episodeNumber: 1,
      };
    }
  }

  return null;
}
