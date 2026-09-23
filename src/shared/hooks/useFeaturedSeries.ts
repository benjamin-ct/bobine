import { useEffect, useState } from "react";
import { getDetails, getSeriesEpisodeBadge } from "../../core/api/tmdb.ts";
import type { SeriesEpisodeBadge } from "../../core/api/tmdb.ts";
import type { LibraryItem } from "../../core/types/library.ts";

export interface FeaturedSeries {
  item: LibraryItem;
  badge: SeriesEpisodeBadge;
}

// Séries "mises en avant" sur la home (Découvrir) : toute série suivie
// (entamée ou en watchlist, contrairement à "Reprendre" qui exige un
// épisode déjà entamé) dont un épisode vient de sortir ou arrive bientôt —
// voir seriesEpisodeBadge.ts pour les fenêtres exactes.
export function useFeaturedSeries(watchlist: LibraryItem[]): FeaturedSeries[] {
  const seriesItems = watchlist.filter((item) => item.mediaType === "tv");
  const key = seriesItems.map((item) => item.id).join(",");

  const [badges, setBadges] = useState<Record<number, SeriesEpisodeBadge | null>>({});

  useEffect(() => {
    let cancelled = false;
    seriesItems.forEach((item) => {
      getDetails("tv", item.id)
        .then((details) => {
          if (!cancelled) {
            const badge = getSeriesEpisodeBadge(details);
            setBadges((prev) => (prev[item.id] === badge ? prev : { ...prev, [item.id]: badge }));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBadges((prev) => (item.id in prev ? prev : { ...prev, [item.id]: null }));
          }
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    seriesItems
      .map((item) => ({ item, badge: badges[item.id] }))
      .filter((entry): entry is FeaturedSeries => Boolean(entry.badge))
      // L'utilisateur a déjà marqué l'épisode déclencheur comme vu (ex. un
      // épisode "vient de sortir" regardé le jour même) : plus rien à mettre
      // en avant pour cette série, même si la fenêtre temporelle du badge est
      // encore valide.
      .filter(
        ({ item, badge }) =>
          !item.watchedEpisodes?.includes(`${badge.seasonNumber}-${badge.episodeNumber}`)
      )
      .sort((a, b) => {
        if (a.badge.kind !== b.badge.kind) {
          return a.badge.kind === "just_released" ? -1 : 1;
        }
        return a.badge.kind === "just_released"
          ? b.badge.date.localeCompare(a.badge.date)
          : a.badge.date.localeCompare(b.badge.date);
      })
  );
}
