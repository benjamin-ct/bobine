// Types partagés pour les réponses de l'API TMDB, dérivés de ce que le code
// consomme réellement (voir README, section "Convention de fetch API") —
// pas une réplique exhaustive de la doc TMDB. Centralisés ici plutôt que
// redéfinis localement dans chaque composant/module.

export type MediaType = "movie" | "tv";

export interface Genre {
  id: number;
  name: string;
}

export interface Country {
  iso_3166_1: string;
  english_name: string;
  native_name?: string;
}

export interface Language {
  iso_639_1: string;
  english_name: string;
  name?: string;
}

/** Résultat brut TMDB pour un film ou une série (discover / search / trending). */
export interface MediaSummary {
  id: number;
  media_type?: MediaType;
  title?: string; // films
  name?: string; // séries
  release_date?: string; // films
  first_air_date?: string; // séries
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  origin_country?: string[];
  original_language?: string;
  /** Présent uniquement quand discover() est appelé avec includeProviderBadge :
   * plateformes déjà résolues côté Worker (voir worker/index.ts), pour éviter
   * un appel /watch/providers par carte depuis le navigateur. `undefined` (pas
   * `null`) tant que le badge n'a pas été demandé — MediaCard s'en sert pour
   * distinguer "pas encore enrichi" (fallback sur l'appel par carte) de
   * "enrichi, aucune plateforme trouvée". */
  watch_providers?: RegionWatchProviders | null;
}

/** MediaSummary enrichi côté client d'un `mediaType` non ambigu (voir
 * chaque page : le type demandé est toujours connu au moment du fetch,
 * `media_type` n'est renvoyé par TMDB que sur les endpoints multi-type). */
export interface MediaItem extends MediaSummary {
  mediaType: MediaType;
}

export interface CastMember {
  id: number;
  credit_id?: string;
  name: string;
  character?: string;
  profile_path?: string | null;
  known_for_department?: string;
}

export interface CrewMember {
  id: number;
  credit_id?: string;
  name: string;
  job?: string;
  department?: string;
  profile_path?: string | null;
}

export interface Credits {
  cast?: CastMember[];
  crew?: CrewMember[];
}

export interface Video {
  id: string;
  key: string;
  site: string;
  type: string;
  name?: string;
}

export interface Videos {
  results?: Video[];
}

export interface ReleaseDateEntry {
  type: number; // 1 avant-première · 2 sortie limitée · 3 sortie nationale · 4 numérique · 5 physique · 6 télévision
  release_date: string;
  note?: string;
}

export interface ReleaseDatesByCountry {
  iso_3166_1: string;
  release_dates: ReleaseDateEntry[];
}

export interface ReleaseDatesResponse {
  results?: ReleaseDatesByCountry[];
}

export interface Season {
  id: number;
  season_number: number;
  name?: string;
  episode_count: number;
}

export interface Episode {
  id: number;
  episode_number: number;
  name?: string;
  overview?: string;
  air_date?: string;
  runtime?: number | null;
}

export interface SeasonDetails {
  season_number: number;
  episodes: Episode[];
}

export interface Network {
  id: number;
  name: string;
}

export interface CollectionSummary {
  id: number;
  name: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

export interface CollectionDetails extends CollectionSummary {
  overview?: string;
  parts: MediaSummary[];
}

export interface CreatedBy {
  id: number;
  name: string;
}

/** Détails complets (append_to_response: credits,videos,recommendations,release_dates,watch/providers). */
export interface MediaDetails extends MediaSummary {
  runtime?: number; // films
  episode_run_time?: number[]; // séries
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: Season[];
  genres?: Genre[];
  credits?: Credits;
  videos?: Videos;
  recommendations?: { results: MediaSummary[] };
  release_dates?: ReleaseDatesResponse;
  // Clé littérale avec un slash : c'est ce que TMDB renvoie pour cette
  // ressource quand elle est incluse via append_to_response.
  "watch/providers"?: WatchProvidersResponse;
  networks?: Network[];
  created_by?: CreatedBy[];
  belongs_to_collection?: CollectionSummary | null;
}

export interface WatchProviderEntry {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priorities?: Record<string, number>;
  display_priority?: number;
}

export interface RegionWatchProviders {
  link?: string;
  flatrate?: WatchProviderEntry[];
  rent?: WatchProviderEntry[];
  buy?: WatchProviderEntry[];
}

export interface WatchProvidersResponse {
  results?: Record<string, RegionWatchProviders>;
}

export interface PagedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface PersonSummary {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string;
  media_type?: "person";
}

export interface PersonDetails extends PersonSummary {
  biography?: string;
  birthday?: string | null;
  place_of_birth?: string | null;
}

export interface PersonCastCredit extends MediaSummary {
  media_type: MediaType;
  character?: string;
  credit_id?: string;
}

export interface PersonCrewCredit extends MediaSummary {
  media_type: MediaType;
  job?: string;
  credit_id?: string;
}

export interface PersonCredits {
  cast?: PersonCastCredit[];
  crew?: PersonCrewCredit[];
}

export interface SearchMultiResult
  extends Omit<MediaSummary, "name" | "media_type">, Omit<PersonSummary, "media_type"> {
  media_type: MediaType | "person";
}
