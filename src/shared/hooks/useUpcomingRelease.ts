import { useEffect, useState } from "react";
import {
  getMovieReleaseDates,
  getDetails,
  getUpcomingMovieRelease,
  getUpcomingSeriesRelease,
} from "../../core/api/tmdb.ts";
import type { MediaType, ReleaseDatesResponse } from "../../core/types/tmdb.ts";

export interface UpcomingReleaseState {
  release: { label: string; date: string } | null;
  status: "idle" | "loading" | "done";
}

/** Prochaine sortie/diffusion connue d'un titre (label + date) : type de
 * sortie prioritaire dans la région pour un film (« Cinéma », « Sortie
 * numérique »...), diffuseur pour une série (voir releaseBadge.ts). Partagé
 * par les cartes de Prochainement (MediaCard) et la frise de la page
 * Prochainement. `enabled` à false : aucun appel réseau. */
export function useUpcomingRelease(
  enabled: boolean,
  mediaType: MediaType,
  id: number,
  region: string,
  date: string | undefined
): UpcomingReleaseState {
  const [state, setState] = useState<UpcomingReleaseState>({ release: null, status: "idle" });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));
    const fetchUpcoming =
      mediaType === "movie"
        ? getMovieReleaseDates(id).then((data) =>
            getUpcomingMovieRelease(data as ReleaseDatesResponse, region, date)
          )
        : getDetails("tv", id).then((data) => getUpcomingSeriesRelease(data));
    fetchUpcoming
      .then((release) => {
        if (!cancelled) {
          setState({ release, status: "done" });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, status: "done" }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, mediaType, id, region, date]);
  return state;
}
