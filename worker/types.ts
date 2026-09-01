// Bindings et variables d'environnement du Worker (voir wrangler.jsonc) —
// une seule source de vérité pour le typage de `env` dans tout le worker.
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;

  // Secrets (dashboard Cloudflare, jamais commités).
  TMDB_API_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  DEBUG_TRIGGER_KEY?: string;
  RESEND_API_KEY?: string;
  RECAPTCHA_SECRET_KEY?: string;

  // Variables non sensibles (commitées dans wrangler.jsonc, voir vars).
  VAPID_PUBLIC_KEY: string;
  VAPID_SUBJECT: string;
  RECAPTCHA_SITE_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

// Lignes D1 (voir migrations/) — reflètent exactement les colonnes
// stockées ; le typage applicatif plus riche (LibraryItem...) vit dans
// src/core/types, réutilisé ici où c'est le même format JSON.
export interface SubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
}

export interface WatchlistItemRow {
  subscription_id: number;
  media_type: string;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  known_providers: string | null;
}

export interface GenrePreferenceRow {
  subscription_id: number;
  media_type: string;
  genre_id: number;
}

export interface LibraryItemRow {
  media_type: string;
  tmdb_id: number;
  status: "watched" | "watchlist";
  data: string;
  updated_at: number;
}

export interface UserRow {
  id: number;
  email: string;
  display_name: string | null;
  created_at: number;
}
