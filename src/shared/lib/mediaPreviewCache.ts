import type { MediaType } from "../../core/types/tmdb.ts";

// Mémoire courte : titre/affiche/date déjà connus depuis une grille ou la
// recherche, pour préafficher la fiche (DetailPage) pendant le chargement
// des vrais détails plutôt qu'un écran vide. Volontairement en mémoire
// (pas de persistance) — ce n'est qu'un raccourci visuel pour la session en
// cours, jamais une source de vérité.
export interface MediaPreview {
  title: string;
  posterPath: string | null;
  date?: string | null;
}

const cache = new Map<string, MediaPreview>();

function key(mediaType: MediaType, id: number | string): string {
  return `${mediaType}:${id}`;
}

export function setMediaPreview(
  mediaType: MediaType,
  id: number | string,
  preview: MediaPreview
): void {
  cache.set(key(mediaType, id), preview);
}

export function getMediaPreview(mediaType: MediaType, id: number | string): MediaPreview | null {
  return cache.get(key(mediaType, id)) ?? null;
}
