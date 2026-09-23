import { useEffect, useState } from "react";
import { getMovieReleaseBadge, getMovieReleaseDates } from "../../core/api/tmdb.ts";
import type { MovieReleaseBadge } from "../../core/api/tmdb.ts";
import type { ReleaseDatesResponse } from "../../core/types/tmdb.ts";
import type { LibraryItem } from "../../core/types/library.ts";

export interface FeaturedMovie {
  item: LibraryItem;
  badge: MovieReleaseBadge;
}

// Films "mis en avant" sur la home (Découvrir) : tout film suivi (entamé ou
// en watchlist) dont la sortie initiale (voir movieReleaseBadge.ts — ciné,
// plateforme ou sortie directement vidéo, quel que soit le canal) vient
// d'avoir lieu ou arrive bientôt. Pendant côté films de useFeaturedSeries.
export function useFeaturedMovies(watchlist: LibraryItem[], region: string): FeaturedMovie[] {
  const movieItems = watchlist.filter((item) => item.mediaType === "movie");
  const key = movieItems.map((item) => item.id).join(",");

  const [badges, setBadges] = useState<Record<number, MovieReleaseBadge | null>>({});

  useEffect(() => {
    let cancelled = false;
    movieItems.forEach((item) => {
      getMovieReleaseDates(item.id)
        .then((data) => {
          if (!cancelled) {
            const badge = getMovieReleaseBadge(
              data as ReleaseDatesResponse,
              region,
              item.date ?? null
            );
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
  }, [key, region]);

  return movieItems
    .map((item) => ({ item, badge: badges[item.id] }))
    .filter((entry): entry is FeaturedMovie => Boolean(entry.badge));
}
