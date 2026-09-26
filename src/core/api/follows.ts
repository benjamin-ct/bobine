// Client des routes "suivre des profils" du Worker (voir worker/follows.ts
// et handleFollow dans worker/index.ts). Même origine que l'app : le cookie
// de session part automatiquement.
import type { FeedEntry, FollowCounts, ProfileSummary } from "../types/social.ts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Suit (ou ne suit plus) le profil partagé `slug` ; renvoie ses compteurs à jour. */
export async function setFollowing(slug: string, following: boolean): Promise<FollowCounts> {
  const { counts } = await request<{ counts: FollowCounts }>(
    `/api/follows/${encodeURIComponent(slug)}`,
    { method: following ? "POST" : "DELETE" }
  );
  return counts;
}

export type FollowListKind = "followers" | "following";

/** Abonnés/abonnements d'un profil partagé, ou du compte connecté (`slug` null). */
export async function getFollowList(
  slug: string | null,
  kind: FollowListKind
): Promise<ProfileSummary[]> {
  const path = slug
    ? `/api/public-profile/${encodeURIComponent(slug)}/${kind}`
    : `/api/account/${kind}`;
  return (await request<{ profiles: ProfileSummary[] }>(path)).profiles;
}

export async function getFeed(): Promise<FeedEntry[]> {
  return (await request<{ entries: FeedEntry[] }>("/api/account/feed")).entries;
}

export async function searchProfiles(query: string): Promise<ProfileSummary[]> {
  return (
    await request<{ profiles: ProfileSummary[] }>(
      `/api/profiles/search?q=${encodeURIComponent(query)}`
    )
  ).profiles;
}
