// Authentification par lien magique (pas de mot de passe) + sessions.
//
// Flux :
//  1. POST /api/auth/request-link { email } -> jeton (pour le lien) + code
//     court (pour saisie manuelle) à usage unique, stockés en base (15 min),
//     envoyés par email via Resend.
//  2a. L'utilisateur clique le lien, arrive sur /auth/verify?token=... côté
//      app (route SPA, pas un endpoint direct — voir plus bas pourquoi).
//  2b. OU, notamment sur iOS où une app ajoutée à l'écran d'accueil tourne
//      dans un stockage isolé de Safari (cliquer le lien, qui s'ouvre dans
//      Safari, ne connecte donc jamais l'app installée) : l'utilisateur
//      tape le code directement dans l'app déjà ouverte, sans jamais
//      changer de contexte de stockage.
//  3. La page/le formulaire appelle POST /api/auth/verify { token } ou
//     { code } : le jeton/code est consommé, l'utilisateur est créé s'il
//     n'existait pas, une session (30 jours) est créée et posée en cookie
//     httpOnly.
import type { Env, UserRow } from "./types.ts";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "bobine_session";
// Alphabet sans caractères ambigus à l'oreille/à l'écrit (pas de 0/O, 1/I/L).
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export interface AuthUser {
  id: number;
  email: string;
  sessionToken: string;
}

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_CHARSET[b % CODE_CHARSET.length]).join("");
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Renvoie { token, code }. `code` a un espace de recherche volontairement
// plus restreint qu'un UUID (32^6 ≈ 1 milliard de combinaisons) pour rester
// tapable à la main : acceptable ici vu la fenêtre de validité courte (15
// min) et le coût réel d'un bruteforce à ce volume de requêtes contre un
// Worker Cloudflare pour une app à usage personnel.
export async function createMagicLink(
  db: D1Database,
  email: string
): Promise<{ token: string; code: string }> {
  const token = randomToken();
  const code = randomCode();
  await db
    .prepare(
      "INSERT INTO magic_links (token, code, email, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)"
    )
    .bind(token, code, email, Date.now() + MAGIC_LINK_TTL_MS)
    .run();
  return { token, code };
}

// Consomme le jeton (marque used_at) et renvoie l'email associé, ou null si
// le jeton est invalide, expiré, ou déjà utilisé.
export async function consumeMagicLink(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT email, expires_at, used_at FROM magic_links WHERE token = ?")
    .bind(token)
    .first<{ email: string; expires_at: number; used_at: number | null }>();
  if (!row || row.used_at || row.expires_at < Date.now()) {
    return null;
  }
  await db
    .prepare("UPDATE magic_links SET used_at = ? WHERE token = ?")
    .bind(Date.now(), token)
    .run();
  return row.email;
}

// Même chose que consumeMagicLink, mais par le code court plutôt que le
// jeton — consomme la même ligne (donc invalide aussi le lien).
export async function consumeMagicLinkByCode(
  db: D1Database,
  code: string | undefined | null
): Promise<string | null> {
  const normalized = (code || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  const row = await db
    .prepare("SELECT email, expires_at, used_at FROM magic_links WHERE code = ?")
    .bind(normalized)
    .first<{ email: string; expires_at: number; used_at: number | null }>();
  if (!row || row.used_at || row.expires_at < Date.now()) {
    return null;
  }
  await db
    .prepare("UPDATE magic_links SET used_at = ? WHERE code = ?")
    .bind(Date.now(), normalized)
    .run();
  return row.email;
}

export async function findOrCreateUser(
  db: D1Database,
  email: string
): Promise<{ id: number; email: string }> {
  const existing = await db
    .prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  if (existing) {
    return existing;
  }
  const result = await db
    .prepare("INSERT INTO users (email, created_at) VALUES (?, ?)")
    .bind(email, Date.now())
    .run();
  return { id: Number(result.meta.last_row_id), email };
}

export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(token, userId, Date.now() + SESSION_TTL_MS, Date.now())
    .run();
  return token;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return null;
}

export async function getUserFromRequest(
  db: D1Database,
  request: Request
): Promise<AuthUser | null> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) {
    return null;
  }
  const row = await db
    .prepare(
      `SELECT users.id, users.email, sessions.expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .bind(token)
    .first<{ id: number; email: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) {
    return null;
  }
  return { id: row.id, email: row.email, sessionToken: token };
}

// `Secure` casse les cookies en local http (wrangler dev sans --local-protocol
// https) : on ne l'ajoute que si la requête est bien passée en https.
export function sessionCookieHeader(
  request: Request,
  token: string | null,
  { clear = false } = {}
): string {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  if (clear) {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=0`;
  }
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}

// Envoie l'email du lien magique via l'API Resend (https://resend.com).
// Sans RESEND_API_KEY configurée (dev local), on ne bloque pas le flux :
// on renvoie le jeton directement dans la réponse API pour pouvoir tester
// sans vraie boîte mail (voir handleRequestLink dans index.ts) — en
// production, RESEND_API_KEY est toujours configurée donc ce cas ne se
// présente jamais côté déployé.
export async function sendMagicLinkEmail(
  env: Env,
  email: string,
  link: string,
  code: string
): Promise<{ skipped: boolean }> {
  if (!env.RESEND_API_KEY) {
    return { skipped: true };
  }

  const from = env.RESEND_FROM_EMAIL || "Bobine <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Ton lien de connexion Bobine 🎬",
      html: `
        <p>Clique sur le lien ci-dessous pour te connecter à Bobine (valable 15 minutes) :</p>
        <p><a href="${link}">${link}</a></p>
        <p>Si tu as installé Bobine sur ton écran d'accueil (iPhone/Android), le lien
        ci-dessus risque de s'ouvrir dans ton navigateur au lieu de l'app installée.
        Dans ce cas, ouvre plutôt l'app Bobine et entre ce code à la place :</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
      `,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Échec de l'envoi de l'email (${res.status}) : ${await res.text().catch(() => "")}`
    );
  }
  return { skipped: false };
}
