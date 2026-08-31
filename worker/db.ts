// Petites fonctions d'accès à D1. Pas d'ORM : le schéma est simple (voir
// migrations/) et les requêtes préparées suffisent largement.
import { decodeHtmlEntities } from "./validate.ts";
import type {
  CleanCustomListMap,
  CleanGenrePref,
  CleanKey,
  CleanLibraryItem,
  CleanWatchlistItem,
  SyncDelete,
  SyncUpsert,
} from "./validate.ts";
import type { GenrePreferenceRow, SubscriptionRow, WatchlistItemRow } from "./types.ts";
import type { CustomListMap, LibraryState } from "../src/core/types/library.ts";

export async function upsertSubscription(
  db: D1Database,
  { endpoint, p256dh, auth }: { endpoint: string; p256dh: string; auth: string }
): Promise<number> {
  const existing = await db
    .prepare("SELECT id FROM subscriptions WHERE endpoint = ?")
    .bind(endpoint)
    .first<{ id: number }>();
  if (existing) {
    return existing.id;
  }

  const result = await db
    .prepare("INSERT INTO subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)")
    .bind(endpoint, p256dh, auth, Date.now())
    .run();
  return Number(result.meta.last_row_id);
}

export async function deleteSubscription(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

export async function deleteSubscriptionById(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM subscriptions WHERE id = ?").bind(id).run();
}

// Remplace entièrement la liste "envie de voir" connue du serveur pour cet
// abonnement (le client est la source de vérité ; on synchronise à chaque
// changement plutôt que de tenter un diff incrémental côté serveur).
export async function replaceWatchlist(
  db: D1Database,
  subscriptionId: number,
  items: CleanWatchlistItem[]
): Promise<void> {
  await db
    .prepare("DELETE FROM watchlist_items WHERE subscription_id = ?")
    .bind(subscriptionId)
    .run();
  if (!items.length) {
    return;
  }
  const stmt = db.prepare(
    "INSERT INTO watchlist_items (subscription_id, media_type, tmdb_id, title, poster_path, known_providers) VALUES (?, ?, ?, ?, ?, ?)"
  );
  await db.batch(
    items.map((item) =>
      stmt.bind(
        subscriptionId,
        item.mediaType,
        item.tmdbId,
        item.title,
        item.posterPath || null,
        null
      )
    )
  );
}

export async function replaceGenrePreferences(
  db: D1Database,
  subscriptionId: number,
  genres: CleanGenrePref[]
): Promise<void> {
  await db
    .prepare("DELETE FROM genre_preferences WHERE subscription_id = ?")
    .bind(subscriptionId)
    .run();
  if (!genres.length) {
    return;
  }
  const stmt = db.prepare(
    "INSERT INTO genre_preferences (subscription_id, media_type, genre_id) VALUES (?, ?, ?)"
  );
  await db.batch(genres.map((g) => stmt.bind(subscriptionId, g.mediaType, g.genreId)));
}

// Résout l'abonnement push depuis son endpoint (seul identifiant que le
// client anonyme connaît) — lookup indexé sur une seule ligne, pas un
// "lire toute la table pour diffs" : c'est une jointure FK normale, pas le
// pattern qu'on cherche à éliminer ci-dessous.
export async function getSubscriptionIdByEndpoint(
  db: D1Database,
  endpoint: string
): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM subscriptions WHERE endpoint = ?")
    .bind(endpoint)
    .first<{ id: number }>();
  return row?.id ?? null;
}

// Applique uniquement les ajouts/retraits fournis par le client (voir
// NotificationSettings : le client connaît son dernier état synchronisé et
// calcule lui-même le delta) — aucune lecture préalable de la table,
// contrairement à replaceWatchlist ci-dessus (toujours utilisée, mais
// seulement pour l'abonnement initial, un vrai remplacement complet).
// `known_providers` est délibérément absent du SET : sur un conflit (item
// déjà connu), on ne touche ni ne réinitialise cette colonne — seule
// updateKnownProviders() doit l'écrire. Seul un item réellement nouveau
// démarre à NULL (repli logique : "pas encore observé").
export async function applyWatchlistChanges(
  db: D1Database,
  subscriptionId: number,
  { add, remove }: { add: CleanWatchlistItem[]; remove: CleanKey[] }
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  if (add.length > 0) {
    const upsertStmt = db.prepare(
      `INSERT INTO watchlist_items (subscription_id, media_type, tmdb_id, title, poster_path, known_providers)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(subscription_id, media_type, tmdb_id) DO UPDATE SET
         title = excluded.title,
         poster_path = excluded.poster_path`
    );
    for (const item of add) {
      statements.push(
        upsertStmt.bind(
          subscriptionId,
          item.mediaType,
          item.tmdbId,
          item.title,
          item.posterPath || null
        )
      );
    }
  }
  if (remove.length > 0) {
    const deleteStmt = db.prepare(
      "DELETE FROM watchlist_items WHERE subscription_id = ? AND media_type = ? AND tmdb_id = ?"
    );
    for (const { mediaType, id } of remove) {
      statements.push(deleteStmt.bind(subscriptionId, mediaType, id));
    }
  }
  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export async function applyGenrePreferenceChanges(
  db: D1Database,
  subscriptionId: number,
  { add, remove }: { add: CleanGenrePref[]; remove: CleanKey[] }
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  if (add.length > 0) {
    // DO NOTHING plutôt que DO UPDATE : la clé (subscription, media_type,
    // genre_id) porte toute l'information, un conflit ne peut être qu'un
    // doublon inoffensif (ex. requête rejouée), rien à mettre à jour.
    const insertStmt = db.prepare(
      `INSERT INTO genre_preferences (subscription_id, media_type, genre_id) VALUES (?, ?, ?)
       ON CONFLICT(subscription_id, media_type, genre_id) DO NOTHING`
    );
    for (const g of add) {
      statements.push(insertStmt.bind(subscriptionId, g.mediaType, g.genreId));
    }
  }
  if (remove.length > 0) {
    const deleteStmt = db.prepare(
      "DELETE FROM genre_preferences WHERE subscription_id = ? AND media_type = ? AND genre_id = ?"
    );
    for (const g of remove) {
      statements.push(deleteStmt.bind(subscriptionId, g.mediaType, g.id));
    }
  }
  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export async function getAllSubscriptions(db: D1Database): Promise<SubscriptionRow[]> {
  const { results } = await db.prepare("SELECT * FROM subscriptions").all<SubscriptionRow>();
  return results;
}

export async function getWatchlistForSubscription(
  db: D1Database,
  subscriptionId: number
): Promise<WatchlistItemRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM watchlist_items WHERE subscription_id = ?")
    .bind(subscriptionId)
    .all<WatchlistItemRow>();
  return results;
}

export async function getGenrePreferencesForSubscription(
  db: D1Database,
  subscriptionId: number
): Promise<GenrePreferenceRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM genre_preferences WHERE subscription_id = ?")
    .bind(subscriptionId)
    .all<GenrePreferenceRow>();
  return results;
}

export async function updateKnownProviders(
  db: D1Database,
  subscriptionId: number,
  mediaType: string,
  tmdbId: number,
  providerIds: number[]
): Promise<void> {
  await db
    .prepare(
      "UPDATE watchlist_items SET known_providers = ? WHERE subscription_id = ? AND media_type = ? AND tmdb_id = ?"
    )
    .bind(JSON.stringify(providerIds), subscriptionId, mediaType, tmdbId)
    .run();
}

// Bibliothèque "vu / envie de voir" synchronisée par compte. -------------

// Renvoie la bibliothèque au même format que l'état client (LibraryContext) :
// { watched: { "movie:123": {...} }, watchlist: { "tv:456": {...} } }.
export async function getLibraryForUser(db: D1Database, userId: number): Promise<LibraryState> {
  const { results } = await db
    .prepare(
      "SELECT media_type, tmdb_id, status, data, updated_at FROM library_items WHERE user_id = ?"
    )
    .bind(userId)
    .all<{
      media_type: string;
      tmdb_id: number;
      status: string;
      data: string;
      updated_at: number;
    }>();
  const watched: LibraryState["watched"] = {};
  const watchlist: LibraryState["watchlist"] = {};
  for (const row of results) {
    const key = `${row.media_type}:${row.tmdb_id}`;
    const item = { ...JSON.parse(row.data), updatedAt: row.updated_at };
    // Répare à la volée les titres encore corrompus par l'ancien bug de
    // double-échappement (voir decodeHtmlEntities) sans attendre une
    // prochaine écriture — la version propre est réécrite en base dès le
    // prochain PUT (toggle) puisque le client renvoie l'état reçu ici tel quel.
    if (typeof item.title === "string") {
      item.title = decodeHtmlEntities(item.title);
    }
    if (row.status === "watched") {
      watched[key] = item;
    } else {
      watchlist[key] = item;
    }
  }
  return { watched, watchlist };
}

// Remplace entièrement la bibliothèque du compte par l'état envoyé par le
// client (le client fusionne avec le serveur avant d'appeler ceci — voir
// LibraryContext — donc un simple remplacement complet est correct et
// évite d'avoir à gérer des suppressions "orphelines" côté serveur).
export async function replaceLibraryForUser(
  db: D1Database,
  userId: number,
  { watched, watchlist }: LibraryState
): Promise<void> {
  await db.prepare("DELETE FROM library_items WHERE user_id = ?").bind(userId).run();

  const rows: Array<{
    mediaType: string;
    tmdbId: string;
    status: "watched" | "watchlist";
    item: CleanLibraryItem;
  }> = [];
  for (const [key, item] of Object.entries(watched || {})) {
    const [mediaType, tmdbId] = key.split(":");
    rows.push({ mediaType, tmdbId, status: "watched", item: item as unknown as CleanLibraryItem });
  }
  for (const [key, item] of Object.entries(watchlist || {})) {
    const [mediaType, tmdbId] = key.split(":");
    rows.push({
      mediaType,
      tmdbId,
      status: "watchlist",
      item: item as unknown as CleanLibraryItem,
    });
  }
  if (rows.length === 0) {
    return;
  }

  const stmt = db.prepare(
    "INSERT INTO library_items (user_id, media_type, tmdb_id, status, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  await db.batch(
    rows.map(({ mediaType, tmdbId, status, item }) => {
      const { updatedAt, ...rest } = item;
      return stmt.bind(
        userId,
        mediaType,
        Number(tmdbId),
        status,
        JSON.stringify(rest),
        updatedAt || Date.now()
      );
    })
  );
}

// Applique uniquement les items ajoutés/modifiés/retirés depuis le dernier
// envoi (voir LibraryContext : chaque toggle/notation/case cochée alimente
// une file d'opérations en attente) — aucune lecture préalable,
// contrairement à une hypothétique version qui diffuserait l'état complet
// à chaque appel. `replaceLibraryForUser` ci-dessus reste utilisée, mais
// uniquement pour la fusion initiale lors d'une première connexion sur un
// nouvel appareil (un vrai remplacement complet y est correct et rare).
export async function applyLibraryChanges(
  db: D1Database,
  userId: number,
  { upserts, deletes }: { upserts: SyncUpsert[]; deletes: SyncDelete[] }
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  if (upserts.length > 0) {
    const upsertStmt = db.prepare(
      `INSERT INTO library_items (user_id, media_type, tmdb_id, status, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, media_type, tmdb_id) DO UPDATE SET
         status = excluded.status,
         data = excluded.data,
         updated_at = excluded.updated_at`
    );
    for (const u of upserts) {
      const { updatedAt, ...rest } = u.item;
      statements.push(
        upsertStmt.bind(
          userId,
          u.mediaType,
          u.tmdbId,
          u.status,
          JSON.stringify(rest),
          updatedAt || Date.now()
        )
      );
    }
  }
  if (deletes.length > 0) {
    // Une suppression par ligne (pas de "WHERE tmdb_id IN (...)") : reste
    // sous la limite de paramètres liés par requête de D1 même pour un lot
    // volumineux, et garde chaque instruction du batch de forme identique.
    const deleteStmt = db.prepare(
      "DELETE FROM library_items WHERE user_id = ? AND media_type = ? AND tmdb_id = ?"
    );
    for (const d of deletes) {
      statements.push(deleteStmt.bind(userId, d.mediaType, d.id));
    }
  }
  if (statements.length > 0) {
    await db.batch(statements);
  }
}

// Listes personnalisées synchronisées par compte. -----------------------

// Renvoie les listes perso au même format que l'état client (LibraryContext),
// items déjà triés par `position` (le tri manuel, voir migrations/).
export async function getCustomListsForUser(
  db: D1Database,
  userId: number
): Promise<CustomListMap> {
  const [{ results: listRows }, { results: itemRows }] = await Promise.all([
    db
      .prepare("SELECT id, name, created_at FROM custom_lists WHERE user_id = ?")
      .bind(userId)
      .all<{ id: string; name: string; created_at: number }>(),
    db
      .prepare(
        "SELECT list_id, media_type, tmdb_id, data FROM custom_list_items WHERE user_id = ? ORDER BY list_id, position"
      )
      .bind(userId)
      .all<{ list_id: string; media_type: string; tmdb_id: number; data: string }>(),
  ]);

  const customLists: CustomListMap = {};
  for (const row of listRows) {
    customLists[row.id] = { id: row.id, name: row.name, createdAt: row.created_at, items: [] };
  }
  for (const row of itemRows) {
    const list = customLists[row.list_id];
    if (!list) {
      continue;
    }
    const item = JSON.parse(row.data);
    if (typeof item.title === "string") {
      item.title = decodeHtmlEntities(item.title);
    }
    list.items.push(item);
  }
  return customLists;
}

// Remplacement complet volontaire, comme replaceLibraryForUser ci-dessus :
// contrairement à library_items (un toggle par item), une liste perso change
// par opérations qui touchent plusieurs lignes à la fois (création,
// renommage, glisser-déposer) — un vrai diff incrémental côté serveur
// n'apporterait rien ici vu l'échelle (usage personnel).
export async function replaceCustomListsForUser(
  db: D1Database,
  userId: number,
  customLists: CleanCustomListMap
): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM custom_list_items WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM custom_lists WHERE user_id = ?").bind(userId),
  ]);

  const lists = Object.values(customLists || {});
  if (lists.length === 0) {
    return;
  }

  const listStmt = db.prepare(
    "INSERT INTO custom_lists (id, user_id, name, created_at) VALUES (?, ?, ?, ?)"
  );
  const itemStmt = db.prepare(
    "INSERT INTO custom_list_items (user_id, list_id, media_type, tmdb_id, data, position) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const statements: D1PreparedStatement[] = [];
  for (const list of lists) {
    statements.push(listStmt.bind(list.id, userId, list.name, list.createdAt));
    list.items.forEach((item: CleanLibraryItem, index: number) => {
      statements.push(
        itemStmt.bind(userId, list.id, item.mediaType, item.id, JSON.stringify(item), index)
      );
    });
  }
  await db.batch(statements);
}

export async function wasAlreadyNotified(
  db: D1Database,
  subscriptionId: number,
  mediaType: string,
  tmdbId: number,
  reason: string
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 FROM notified_releases WHERE subscription_id = ? AND media_type = ? AND tmdb_id = ? AND reason = ?"
    )
    .bind(subscriptionId, mediaType, tmdbId, reason)
    .first();
  return Boolean(row);
}

export async function markNotified(
  db: D1Database,
  subscriptionId: number,
  mediaType: string,
  tmdbId: number,
  reason: string
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO notified_releases (subscription_id, media_type, tmdb_id, reason, notified_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(subscriptionId, mediaType, tmdbId, reason, Date.now())
    .run();
}
