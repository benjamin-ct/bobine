// Types du domaine "bibliothèque personnelle" (déjà vu / envie de voir /
// listes personnalisées) — forme partagée entre LibraryContext, le worker
// (validation, D1) et tous les modules qui affichent ces données.
import type { MediaType } from "./tmdb.ts";

export interface DirectorRef {
  id: number;
  name: string;
}

/** Item minimal transmis par les pages lors d'un toggle "vu"/"envie de voir" —
 * voir chaque module (Detail, MediaCard...) pour la construction de cette forme. */
export interface LibraryItemInput {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  date?: string;
  genreIds?: number[];
  runtimeMinutes?: number | null;
}

/** Item tel que stocké (localStorage + D1) : `LibraryItemInput` enrichi des
 * métadonnées propres au suivi (note, épisodes vus, horodatage...). */
export interface LibraryItem extends LibraryItemInput {
  addedAt: number;
  updatedAt: number;
  rating?: number | null;
  /** Uniquement pour les séries — clés "saison-épisode", ex. "1-5". */
  watchedEpisodes?: string[];
  directors?: DirectorRef[];
}

export type LibraryItemMap = Record<string, LibraryItem>;

export interface LibraryState {
  watched: LibraryItemMap;
  watchlist: LibraryItemMap;
}

export interface CustomList {
  id: string;
  name: string;
  /** Items stockés directement ici (pas juste des clés vers watched/watchlist) :
   * une liste perso doit fonctionner pour un titre jamais marqué "vu" ni
   * "envie de voir". L'ordre du tableau porte aussi le tri manuel. */
  items: LibraryItem[];
  createdAt: number;
}

export type CustomListMap = Record<string, CustomList>;
