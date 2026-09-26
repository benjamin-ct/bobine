// Accès D1 des rappels « Me prévenir » (migration 0014). Un rappel est
// indépendant de l'envie de voir : on peut avoir l'un sans l'autre. Le
// scheduler (worker/scheduled.ts, checkReminders) prévient le jour de la
// sortie, puis à chaque arrivée sur une plateforme de streaming.
import type { CleanReminder } from "./validate.ts";
import type { MediaType } from "../src/core/types/tmdb.ts";

export const MAX_REMINDERS = 500;

export interface ReminderRow {
  user_id: number;
  media_type: string;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  known_providers: string | null;
  sync_host: string | null;
}

// Forme renvoyée au client (GET /api/reminders).
export interface ReminderSummary {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
}

export async function getRemindersForUser(
  db: D1Database,
  userId: number
): Promise<ReminderSummary[]> {
  const { results } = await db
    .prepare(
      "SELECT media_type, tmdb_id, title, poster_path, release_date FROM reminders WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(userId)
    .all<ReminderRow>();
  return results.map((row) => ({
    mediaType: row.media_type as MediaType,
    tmdbId: row.tmdb_id,
    title: row.title,
    posterPath: row.poster_path,
    releaseDate: row.release_date,
  }));
}

export async function countReminders(db: D1Database, userId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM reminders WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// Réajouter un rappel existant met à jour son titre/affiche/date, sans
// toucher à la référence des plateformes déjà connues.
export async function addReminder(
  db: D1Database,
  userId: number,
  reminder: CleanReminder,
  syncHost: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reminders (user_id, media_type, tmdb_id, title, poster_path, release_date, sync_host, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, media_type, tmdb_id) DO UPDATE SET
         title = excluded.title,
         poster_path = excluded.poster_path,
         release_date = excluded.release_date,
         sync_host = excluded.sync_host`
    )
    .bind(
      userId,
      reminder.mediaType,
      reminder.tmdbId,
      reminder.title,
      reminder.posterPath,
      reminder.releaseDate,
      syncHost,
      Date.now()
    )
    .run();
}

export async function removeReminder(
  db: D1Database,
  userId: number,
  mediaType: string,
  tmdbId: number
): Promise<void> {
  await db
    .prepare("DELETE FROM reminders WHERE user_id = ? AND media_type = ? AND tmdb_id = ?")
    .bind(userId, mediaType, tmdbId)
    .run();
}

export async function getAllReminders(db: D1Database): Promise<ReminderRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM reminders ORDER BY user_id")
    .all<ReminderRow>();
  return results;
}

export async function updateReminderProviders(
  db: D1Database,
  userId: number,
  mediaType: string,
  tmdbId: number,
  providers: number[]
): Promise<void> {
  await db
    .prepare(
      "UPDATE reminders SET known_providers = ? WHERE user_id = ? AND media_type = ? AND tmdb_id = ?"
    )
    .bind(JSON.stringify(providers), userId, mediaType, tmdbId)
    .run();
}
