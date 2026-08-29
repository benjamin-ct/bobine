import type { LibraryItem } from "../../core/types/library.ts";
import type { MediaItem } from "../../core/types/tmdb.ts";

// `LibraryItem` (bibliothèque personnelle : localStorage + D1) stocke ses
// champs en camelCase (`posterPath`, `date`, `genreIds`) — une forme propre
// au domaine "bibliothèque", distincte du `MediaItem` TMDB brut (snake_case :
// `poster_path`, `release_date`, `genre_ids`) que MediaCard sait afficher.
// Les deux se ressemblent mais ne sont PAS interchangeables : passer un
// LibraryItem directement là où un MediaItem est attendu ne lève aucune
// erreur (les deux formes ont un `id`/`title`/`mediaType`) mais MediaCard lit
// `item.poster_path`, toujours absent d'un LibraryItem — chaque carte retombe
// silencieusement sur son repli "pas d'affiche" (voir le ticket Trello
// "Toutes les affiches disparaissent dans l'onglet « Envie de voir »").
export function libraryItemToMediaItem(item: LibraryItem): MediaItem {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    release_date: item.date,
    poster_path: item.posterPath,
    genre_ids: item.genreIds,
  };
}
