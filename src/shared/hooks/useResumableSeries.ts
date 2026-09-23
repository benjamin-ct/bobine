import { useEffect, useState } from "react";
import { getDetails, getSeasonDetails } from "../../core/api/tmdb.ts";
import { isStrictlyFutureDate } from "../../core/api/releaseBadge.ts";
import type { LibraryItem } from "../../core/types/library.ts";

// Une série vaut la peine d'apparaître dans "Reprendre" seulement si le
// prochain épisode après le dernier vu (dans l'ordre chronologique
// saison/épisode, pas juste "un épisode non vu quelque part") est déjà
// diffusé : une série dont on a vu les 7 premiers épisodes de la saison en
// cours mais dont l'épisode 8 n'est pas encore sorti n'a rien à "reprendre"
// concrètement, même si d'anciennes saisons non regardées traînent encore.
export function useResumableSeries(watchlist: LibraryItem[]): LibraryItem[] {
  const startedSeries = watchlist.filter(
    (item) => item.mediaType === "tv" && (item.watchedEpisodes?.length || 0) > 0
  );
  // Clé stable pour ne relancer les vérifications TMDB que si l'ensemble des
  // séries entamées (ou leurs épisodes vus) change réellement.
  const key = startedSeries
    .map((item) => `${item.id}:${item.watchedEpisodes?.join(",") || ""}`)
    .join("|");

  // `undefined` = pas encore vérifiée : affichée par défaut (optimiste) pour
  // éviter qu'une série ne disparaisse puis ne réapparaisse à l'écran.
  const [resumable, setResumable] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    startedSeries.forEach((item) => {
      hasResumableEpisode(item).then((result) => {
        if (!cancelled) {
          setResumable((prev) =>
            prev[item.id] === result ? prev : { ...prev, [item.id]: result }
          );
        }
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return startedSeries.filter((item) => resumable[item.id] !== false);
}

// Dernier épisode vu, au sens chronologique saison/épisode (pas ordre
// d'ajout dans watchedEpisodes) : point de départ pour déterminer "le
// prochain épisode" à proposer dans Reprendre.
function lastWatchedEntry(watchedEpisodes: string[]): {
  seasonNumber: number;
  episodeNumber: number;
} {
  return watchedEpisodes
    .map((key) => {
      const [seasonNumber, episodeNumber] = key.split("-").map(Number);
      return { seasonNumber, episodeNumber };
    })
    .reduce((max, entry) =>
      entry.seasonNumber > max.seasonNumber ||
      (entry.seasonNumber === max.seasonNumber && entry.episodeNumber > max.episodeNumber)
        ? entry
        : max
    );
}

async function hasResumableEpisode(item: LibraryItem): Promise<boolean> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const watchedEpisodes = item.watchedEpisodes || [];
  if (watchedEpisodes.length === 0) {
    return false;
  }
  const lastWatched = lastWatchedEntry(watchedEpisodes);
  try {
    const details = await getDetails("tv", item.id);
    const seasons = (details.seasons || [])
      .filter((s) => s.episode_count > 0)
      .sort((a, b) => a.season_number - b.season_number);
    const currentSeason = seasons.find((s) => s.season_number === lastWatched.seasonNumber);
    if (!currentSeason) {
      return false;
    }

    if (lastWatched.episodeNumber < currentSeason.episode_count) {
      const { episodes } = await getSeasonDetails(item.id, currentSeason.season_number);
      const nextEpisode = (episodes || []).find(
        (ep) => ep.episode_number === lastWatched.episodeNumber + 1
      );
      return nextEpisode ? !isStrictlyFutureDate(nextEpisode.air_date, todayIso) : false;
    }

    // Saison en cours entièrement vue : le prochain épisode est le premier
    // de la saison suivante connue, s'il y en a une.
    const nextSeason = seasons.find((s) => s.season_number > currentSeason.season_number);
    if (!nextSeason) {
      return false;
    }
    const { episodes } = await getSeasonDetails(item.id, nextSeason.season_number);
    const firstEpisode = (episodes || [])[0];
    return firstEpisode ? !isStrictlyFutureDate(firstEpisode.air_date, todayIso) : false;
  } catch {
    // TMDB indisponible : ne pas masquer la série par erreur.
    return true;
  }
}
