// Accès D1 du domaine "suivre des profils" (migration 0011). Règles de
// visibilité, appliquées ici plutôt qu'à chaque appelant :
// - on ne peut suivre qu'un profil partagé, résolu par son slug public ;
// - un profil devenu privé disparaît des listes d'abonnements, des
//   compteurs d'abonnements et du fil d'activité de ceux qui le suivent (la
//   ligne reste en base et réapparaît s'il repartage son profil) ;
// - un abonné au profil privé reste compté et listé chez la personne qu'il
//   suit, mais anonymisé (ni nom ni lien) : il n'a rien choisi de rendre
//   public.
import { decodeHtmlEntities } from "./validate.ts";
import type { LibraryItem } from "../src/core/types/library.ts";
import type {
  FeedEntry,
  FollowCounts,
  ProfileSummary,
  TitleActivity,
} from "../src/core/types/social.ts";

export const FEED_LIMIT = 60;
const LIST_LIMIT = 500;
const SEARCH_LIMIT = 20;

export async function getUserIdBySlug(db: D1Database, slug: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM users WHERE share_slug = ?")
    .bind(slug)
    .first<{ id: number }>();
  return row?.id ?? null;
}

/** `true` si l'abonnement vient d'être créé (pas déjà existant). */
export async function follow(db: D1Database, followerId: number, followedId: number) {
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)"
    )
    .bind(followerId, followedId, Date.now())
    .run();
  return result.meta.changes > 0;
}

export async function unfollow(db: D1Database, followerId: number, followedId: number) {
  await db
    .prepare("DELETE FROM follows WHERE follower_id = ? AND followed_id = ?")
    .bind(followerId, followedId)
    .run();
}

export async function isFollowing(db: D1Database, followerId: number, followedId: number) {
  const row = await db
    .prepare("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followed_id = ?")
    .bind(followerId, followedId)
    .first<{ found: number }>();
  return row !== null;
}

export async function getFollowCounts(db: D1Database, userId: number): Promise<FollowCounts> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM follows WHERE followed_id = ?1) AS followers,
         (SELECT COUNT(*) FROM follows JOIN users ON users.id = follows.followed_id
            WHERE follows.follower_id = ?1 AND users.share_slug IS NOT NULL) AS following`
    )
    .bind(userId)
    .first<FollowCounts>();
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}

interface SummaryRow {
  id: number;
  share_slug: string | null;
  display_name: string | null;
  viewer_follows: number;
}

function toSummary(row: SummaryRow, viewerId: number | null): ProfileSummary {
  const isPublic = row.share_slug !== null;
  return {
    slug: row.share_slug,
    displayName: isPublic ? row.display_name : null,
    viewerFollows: row.viewer_follows === 1,
    isSelf: row.id === viewerId,
  };
}

// `viewer_follows` : le visiteur connecté (ou personne, id -1) suit-il ce
// profil ? Calculé dans la même requête pour afficher directement le bon
// bouton Suivre/Suivi dans la liste.
const VIEWER_FOLLOWS = `EXISTS (SELECT 1 FROM follows v WHERE v.follower_id = ?2 AND v.followed_id = users.id)`;

export async function getFollowers(
  db: D1Database,
  userId: number,
  viewerId: number | null
): Promise<ProfileSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT users.id, users.share_slug, users.display_name, ${VIEWER_FOLLOWS} AS viewer_follows
       FROM follows JOIN users ON users.id = follows.follower_id
       WHERE follows.followed_id = ?1
       ORDER BY follows.created_at DESC LIMIT ${LIST_LIMIT}`
    )
    .bind(userId, viewerId ?? -1)
    .all<SummaryRow>();
  return results.map((row) => toSummary(row, viewerId));
}

export async function getFollowing(
  db: D1Database,
  userId: number,
  viewerId: number | null
): Promise<ProfileSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT users.id, users.share_slug, users.display_name, ${VIEWER_FOLLOWS} AS viewer_follows
       FROM follows JOIN users ON users.id = follows.followed_id
       WHERE follows.follower_id = ?1 AND users.share_slug IS NOT NULL
       ORDER BY follows.created_at DESC LIMIT ${LIST_LIMIT}`
    )
    .bind(userId, viewerId ?? -1)
    .all<SummaryRow>();
  return results.map((row) => toSummary(row, viewerId));
}

// Recherche par nom affiché, limitée aux profils partagés (un profil privé
// n'est jamais trouvable). LIKE insensible à la casse pour l'ASCII ; les
// jokers saisis par l'utilisateur sont échappés.
export async function searchProfiles(
  db: D1Database,
  query: string,
  viewerId: number
): Promise<ProfileSummary[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { results } = await db
    .prepare(
      `SELECT users.id, users.share_slug, users.display_name, ${VIEWER_FOLLOWS} AS viewer_follows
       FROM users
       WHERE users.share_slug IS NOT NULL AND users.id <> ?2
         AND users.display_name LIKE ?1 ESCAPE '\\'
       ORDER BY users.display_name COLLATE NOCASE LIMIT ${SEARCH_LIMIT}`
    )
    .bind(pattern, viewerId)
    .all<SummaryRow>();
  return results.map((row) => toSummary(row, viewerId));
}

// Fil d'activité : dernières entrées "vu" / "envie de voir" des profils
// suivis encore partagés, du plus récent au plus ancien. `updated_at` bouge
// aussi quand un titre est noté : une note récente remonte donc le titre.
export async function getFeed(db: D1Database, userId: number): Promise<FeedEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT users.share_slug, users.display_name, library_items.status,
              library_items.data, library_items.updated_at
       FROM follows
       JOIN users ON users.id = follows.followed_id AND users.share_slug IS NOT NULL
       JOIN library_items ON library_items.user_id = users.id
       WHERE follows.follower_id = ?
       ORDER BY library_items.updated_at DESC LIMIT ${FEED_LIMIT}`
    )
    .bind(userId)
    .all<{
      share_slug: string;
      display_name: string | null;
      status: "watched" | "watchlist";
      data: string;
      updated_at: number;
    }>();
  return results.map((row) => {
    const { watchedEpisodes: _watchedEpisodes, ...item } = JSON.parse(row.data) as LibraryItem;
    return {
      profile: { slug: row.share_slug, displayName: row.display_name },
      status: row.status,
      item: {
        ...item,
        title: typeof item.title === "string" ? decodeHtmlEntities(item.title) : item.title,
        updatedAt: row.updated_at,
      },
    };
  });
}

// Bloc « Vos abonnements » de la fiche : ce que les profils suivis (encore
// partagés) ont fait d'un titre précis — vu (avec leur note) ou envie de
// voir. `following` sert au client pour masquer le bloc quand on ne suit
// personne (et seulement dans ce cas).
export async function getTitleActivity(
  db: D1Database,
  userId: number,
  mediaType: string,
  tmdbId: number
): Promise<TitleActivity> {
  const [counts, { results }] = await Promise.all([
    getFollowCounts(db, userId),
    db
      .prepare(
        `SELECT users.share_slug, users.display_name, library_items.status, library_items.data,
                library_items.updated_at
         FROM follows
         JOIN users ON users.id = follows.followed_id AND users.share_slug IS NOT NULL
         JOIN library_items ON library_items.user_id = users.id
           AND library_items.media_type = ? AND library_items.tmdb_id = ?
         WHERE follows.follower_id = ?
         ORDER BY library_items.status = 'watched' DESC, library_items.updated_at DESC
         LIMIT ${LIST_LIMIT}`
      )
      .bind(mediaType, tmdbId, userId)
      .all<{
        share_slug: string;
        display_name: string | null;
        status: "watched" | "watchlist";
        data: string;
        updated_at: number;
      }>(),
  ]);
  return {
    following: counts.following,
    entries: results.map((row) => {
      const { rating } = JSON.parse(row.data) as LibraryItem;
      return {
        profile: { slug: row.share_slug, displayName: row.display_name },
        status: row.status,
        rating: row.status === "watched" && typeof rating === "number" ? rating : null,
        updatedAt: row.updated_at,
      };
    }),
  };
}
