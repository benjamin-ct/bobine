import { useCallback, useEffect, useRef, useState } from "react";
import { getSeasonDetails } from "../../core/api/tmdb.ts";
import { isStrictlyFutureDate } from "../../core/api/releaseBadge.ts";
import type { EpisodeRef } from "../../core/types/library.ts";
import type { Episode, Season } from "../../core/types/tmdb.ts";

export type LoadSeason = (seasonNumber: number) => Promise<Episode[]>;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Épisode déjà diffusé (date TMDB connue et passée). */
export function isAired(episode: Episode, today: string = todayIso()): boolean {
  return Boolean(episode.air_date) && !isStrictlyFutureDate(episode.air_date, today);
}

// Liste des épisodes par saison, partagée entre le bouton « Marquer la
// série comme vue » et le bloc Épisodes : TMDB ne la donne que saison par
// saison (un appel par saison), chargée à la demande et gardée pour la
// durée de la fiche.
export function useSeasonEpisodes(tvId: number) {
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, Episode[]>>({});
  const pendingRef = useRef(new Map<number, Promise<Episode[]>>());
  const tvIdRef = useRef(tvId);

  useEffect(() => {
    tvIdRef.current = tvId;
    pendingRef.current = new Map();
    setEpisodesBySeason({});
  }, [tvId]);

  const loadSeason = useCallback<LoadSeason>(
    (seasonNumber) => {
      const pending = pendingRef.current;
      let promise = pending.get(seasonNumber);
      if (!promise) {
        promise = getSeasonDetails(tvId, seasonNumber)
          .then((data) => data.episodes || [])
          .catch(() => {
            // Erreur réseau : on retentera au prochain appel.
            pending.delete(seasonNumber);
            return [] as Episode[];
          });
        pending.set(seasonNumber, promise);
        promise.then((episodes) => {
          if (tvIdRef.current === tvId) {
            setEpisodesBySeason((prev) => ({ ...prev, [seasonNumber]: episodes }));
          }
        });
      }
      return promise;
    },
    [tvId]
  );

  return { episodesBySeason, loadSeason };
}

/** Saisons « normales » (hors épisodes spéciaux, saison 0), dans l'ordre. */
export function mainSeasons(seasons: Season[]): Season[] {
  return seasons
    .filter((s) => s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number);
}

// Tous les épisodes diffusés des saisons normales, jusqu'à `upTo` inclus
// s'il est donné (« Vu jusqu'ici »), sinon toute la série (« Marquer la
// série comme vue »).
export async function airedEpisodesUpTo(
  seasons: Season[],
  loadSeason: LoadSeason,
  upTo?: EpisodeRef
): Promise<EpisodeRef[]> {
  const today = todayIso();
  const targets = mainSeasons(seasons).filter(
    (s) => s.episode_count > 0 && (!upTo || s.season_number <= upTo.seasonNumber)
  );
  const lists = await Promise.all(targets.map((s) => loadSeason(s.season_number)));
  return targets.flatMap((season, i) =>
    lists[i]
      .filter(
        (ep) =>
          isAired(ep, today) &&
          (!upTo ||
            season.season_number < upTo.seasonNumber ||
            ep.episode_number <= upTo.episodeNumber)
      )
      .map((ep) => ({ seasonNumber: season.season_number, episodeNumber: ep.episode_number }))
  );
}
