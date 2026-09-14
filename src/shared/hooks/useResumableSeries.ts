import { useEffect, useState } from "react";
import { getDetails, getSeasonDetails } from "../../core/api/tmdb.ts";
import { isStrictlyFutureDate } from "../../core/api/releaseBadge.ts";
import type { LibraryItem } from "../../core/types/library.ts";

// Une série vaut la peine d'apparaître dans "Reprendre" seulement s'il lui
// reste au moins un épisode non vu déjà diffusé : une série terminée, ou
// dont le seul épisode restant n'est pas encore sorti (ex. 31/32 vus,
// épisode 32 annoncé pour la semaine prochaine), n'a rien à "reprendre"
// concrètement.
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
          setResumable((prev) => (prev[item.id] === result ? prev : { ...prev, [item.id]: result }));
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

function countWatchedInSeason(watched: Set<string>, seasonNumber: number): number {
  let count = 0;
  for (const key of watched) {
    if (key.startsWith(`${seasonNumber}-`)) {
      count += 1;
    }
  }
  return count;
}

async function hasResumableEpisode(item: LibraryItem): Promise<boolean> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const watched = new Set(item.watchedEpisodes || []);
  try {
    const details = await getDetails("tv", item.id);
    const incompleteSeasons = (details.seasons || []).filter(
      (s) => s.episode_count > 0 && countWatchedInSeason(watched, s.season_number) < s.episode_count
    );
    for (const season of incompleteSeasons) {
      const { episodes } = await getSeasonDetails(item.id, season.season_number);
      const hasReleasedUnwatched = (episodes || []).some(
        (ep) =>
          !watched.has(`${season.season_number}-${ep.episode_number}`) &&
          !isStrictlyFutureDate(ep.air_date, todayIso)
      );
      if (hasReleasedUnwatched) {
        return true;
      }
    }
    return false;
  } catch {
    // TMDB indisponible : ne pas masquer la série par erreur.
    return true;
  }
}
