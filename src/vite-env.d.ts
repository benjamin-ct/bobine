/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clé API TMDB (v3), utilisée uniquement en dev local — voir src/core/api/tmdbClient.ts. */
  readonly VITE_TMDB_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
