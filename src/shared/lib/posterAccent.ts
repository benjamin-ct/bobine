// Choix de la clé duotone (voir posterAccents.module.css) utilisée comme
// repli visuel quand un titre/une personne n'a pas d'affiche/photo TMDB —
// repris de la maquette HTML ("clé d'affiche" par genre). Faute d'un genre
// disponible partout où ce repli est utilisé (ex. carte "Souvent à
// l'affiche avec"), la clé est dérivée d'un hash stable du titre/nom plutôt
// que du genre : déterministe (la même carte garde toujours la même
// couleur d'une visite à l'autre) sans dépendre d'une donnée optionnelle.
export const POSTER_ACCENT_KEYS = [
  "scifi",
  "drama",
  "thriller",
  "horror",
  "animation",
  "romance",
  "comedy",
  "adventure",
] as const;

export type PosterAccentKey = (typeof POSTER_ACCENT_KEYS)[number];

// Genres TMDB (ids films + séries fusionnés) les plus proches de chaque clé
// — utilisé quand on connaît déjà les genres d'un titre (MediaCard), pour
// une couleur qui a un minimum de sens plutôt qu'un hash pur.
const GENRE_ID_TO_ACCENT: Record<number, PosterAccentKey> = {
  878: "scifi", // Science-Fiction
  10765: "scifi", // Sci-Fi & Fantasy (TV)
  18: "drama", // Drame
  53: "thriller", // Thriller
  80: "thriller", // Crime
  27: "horror", // Horreur
  16: "animation", // Animation
  10749: "romance", // Romance
  35: "comedy", // Comédie
  12: "adventure", // Aventure
  14: "adventure", // Fantasy
  10759: "adventure", // Action & Adventure (TV)
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function posterAccentFromSeed(seed: string): PosterAccentKey {
  return POSTER_ACCENT_KEYS[hashString(seed) % POSTER_ACCENT_KEYS.length];
}

export function posterAccentFromGenres(
  genreIds: number[] | undefined,
  fallbackSeed: string
): PosterAccentKey {
  const match = genreIds?.find((id) => GENRE_ID_TO_ACCENT[id]);
  return match !== undefined ? GENRE_ID_TO_ACCENT[match] : posterAccentFromSeed(fallbackSeed);
}
