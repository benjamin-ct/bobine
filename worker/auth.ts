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
// Cookie compagnon, lisible en JS (pas HttpOnly, aucune valeur sensible :
// juste "1"), posé/effacé en même temps que SESSION_COOKIE — voir
// AuthContext.tsx, qui l'utilise pour savoir s'il vaut la peine d'appeler
// /api/auth/me. But : un visiteur anonyme (donc sans jamais avoir eu de
// session) n'a jamais ce cookie et peut sauter cet appel réseau — ce qui
// couvre aussi tout le trafic de crawlers/bots, qui ne se connectent jamais.
const AUTH_HINT_COOKIE = "bobine_auth";
// Alphabet sans caractères ambigus à l'oreille/à l'écrit (pas de 0/O, 1/I/L).
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
  /** Slug du lien de partage public du profil, `null` tant que le profil est
   * privé (voir migrations/0009_profile_share.sql). */
  shareSlug: string | null;
  /** Pseudo public (migration 0012), `null` tant qu'aucun n'a été choisi. */
  username: string | null;
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

// Renvoie aussi le nom affiché et le lien de partage : le client les applique
// dès la connexion (voir verifyWith dans AuthContext), sans quoi un compte qui
// se reconnecte apparaît sans nom et avec un profil "privé" alors qu'il est
// toujours partagé.
export async function findOrCreateUser(
  db: D1Database,
  email: string
): Promise<{
  id: number;
  email: string;
  displayName: string | null;
  shareSlug: string | null;
  username: string | null;
}> {
  const existing = await db
    .prepare("SELECT id, email, display_name, share_slug, username FROM users WHERE email = ?")
    .bind(email)
    .first<Pick<UserRow, "id" | "email" | "display_name" | "share_slug" | "username">>();
  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      displayName: existing.display_name,
      shareSlug: existing.share_slug,
      username: existing.username,
    };
  }
  const result = await db
    .prepare("INSERT INTO users (email, created_at) VALUES (?, ?)")
    .bind(email, Date.now())
    .run();
  return {
    id: Number(result.meta.last_row_id),
    email,
    displayName: null,
    shareSlug: null,
    username: null,
  };
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
      `SELECT users.id, users.email, users.display_name, users.share_slug, users.username,
              sessions.expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .bind(token)
    .first<{
      id: number;
      email: string;
      display_name: string | null;
      share_slug: string | null;
      username: string | null;
      expires_at: number;
    }>();
  if (!row || row.expires_at < Date.now()) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    shareSlug: row.share_slug,
    username: row.username,
    sessionToken: token,
  };
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

// Même durée de vie que sessionCookieHeader, volontairement PAS HttpOnly
// (voir AUTH_HINT_COOKIE) : les deux cookies sont toujours posés/effacés
// ensemble, donc leur présence reste cohérente.
export function authHintCookieHeader(request: Request, { clear = false } = {}): string {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  if (clear) {
    return `${AUTH_HINT_COOKIE}=; Path=/;${secure} SameSite=Lax; Max-Age=0`;
  }
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${AUTH_HINT_COOKIE}=1; Path=/;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}

// Langue du destinataire de l'email : celle active dans son navigateur au
// moment où il a lui-même demandé le lien (voir handleRequestLink), pas une
// donnée stockée en base — contrairement aux notifications push envoyées
// par le scheduler à retardement, le destinataire ici EST la personne qui
// vient de faire la demande, dans la même requête.
export type EmailLocale = "fr" | "en";

const MAGIC_LINK_EMAIL_CONTENT: Record<
  EmailLocale,
  { subject: string; html: (link: string, code: string) => string }
> = {
  fr: {
    subject: "Ton lien de connexion Bobine 🎬",
    html: (link, code) => `
        <p>Clique sur le lien ci-dessous pour te connecter à Bobine (valable 15 minutes) :</p>
        <p><a href="${link}">${link}</a></p>
        <p>Si tu as installé Bobine sur ton écran d'accueil (iPhone/Android), le lien
        ci-dessus risque de s'ouvrir dans ton navigateur au lieu de l'app installée.
        Dans ce cas, ouvre plutôt l'app Bobine et entre ce code à la place :</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
      `,
  },
  en: {
    subject: "Your Bobine sign-in link 🎬",
    html: (link, code) => `
        <p>Click the link below to sign in to Bobine (valid for 15 minutes):</p>
        <p><a href="${link}">${link}</a></p>
        <p>If you installed Bobine on your home screen (iPhone/Android), the link
        above might open in your browser instead of the installed app.
        In that case, open the Bobine app instead and enter this code:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
  },
};

// Changement d'adresse email (voir createEmailChange) : le code part à la
// NOUVELLE adresse, l'avertissement à l'ANCIENNE une fois le changement fait
// — pour que le titulaire légitime s'en aperçoive si quelqu'un d'autre
// avait accès à sa session.
const EMAIL_CHANGE_CODE_CONTENT: Record<
  EmailLocale,
  { subject: string; html: (code: string) => string }
> = {
  fr: {
    subject: "Confirme ta nouvelle adresse email Bobine",
    html: (code) => `
        <p>Pour associer cette adresse à ton compte Bobine, entre ce code dans
        Profil → Compte (valable 15 minutes) :</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>Si tu n'es pas à l'origine de cette demande, ignore cet email : ton
        adresse ne sera pas utilisée.</p>
      `,
  },
  en: {
    subject: "Confirm your new Bobine email address",
    html: (code) => `
        <p>To link this address to your Bobine account, enter this code in
        Profile → Account (valid for 15 minutes):</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>If you didn't request this, you can safely ignore this email: your
        address won't be used.</p>
      `,
  },
};

const EMAIL_CHANGED_NOTICE_CONTENT: Record<
  EmailLocale,
  { subject: string; html: (newEmail: string) => string }
> = {
  fr: {
    subject: "L'adresse email de ton compte Bobine a changé",
    html: (newEmail) => `
        <p>L'adresse email de ton compte Bobine vient d'être remplacée par
        <strong>${escapeHtml(newEmail)}</strong>. Tu ne recevras plus tes liens de
        connexion à cette adresse-ci.</p>
        <p>Si tu n'es pas à l'origine de ce changement, contacte-nous au plus vite
        en répondant à cet email.</p>
      `,
  },
  en: {
    subject: "Your Bobine account email address has changed",
    html: (newEmail) => `
        <p>The email address of your Bobine account has just been changed to
        <strong>${escapeHtml(newEmail)}</strong>. You won't receive sign-in links at
        this address anymore.</p>
        <p>If you didn't make this change, contact us as soon as possible by
        replying to this email.</p>
      `,
  },
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

// Crée (ou remplace) la demande de changement d'adresse du compte et
// renvoie le code à envoyer à la nouvelle adresse.
export async function createEmailChange(
  db: D1Database,
  userId: number,
  newEmail: string
): Promise<string> {
  const code = randomCode();
  await db
    .prepare(
      `INSERT INTO email_changes (user_id, new_email, code, expires_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET new_email = excluded.new_email,
         code = excluded.code, expires_at = excluded.expires_at`
    )
    .bind(userId, newEmail, code, Date.now() + MAGIC_LINK_TTL_MS)
    .run();
  return code;
}

export type EmailChangeResult =
  | { ok: true; oldEmail: string; newEmail: string }
  | { ok: false; reason: "invalid-code" | "taken" };

// Applique le changement si `code` correspond à la demande en attente du
// compte. Le code n'est cherché QUE parmi les demandes de `userId` (jamais
// globalement) : impossible de valider la demande d'un autre compte. Les
// liens de connexion encore valides envoyés à l'ancienne adresse sont
// invalidés, sans quoi l'un d'eux recréerait un compte vide à cette adresse.
export async function confirmEmailChange(
  db: D1Database,
  userId: number,
  code: string | undefined | null
): Promise<EmailChangeResult> {
  const normalized = (code || "").trim().toUpperCase();
  const pending = normalized
    ? await db
        .prepare("SELECT new_email, code, expires_at FROM email_changes WHERE user_id = ?")
        .bind(userId)
        .first<{ new_email: string; code: string; expires_at: number }>()
    : null;
  if (!pending || pending.code !== normalized || pending.expires_at < Date.now()) {
    return { ok: false, reason: "invalid-code" };
  }
  const current = await db
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();
  if (!current) {
    return { ok: false, reason: "invalid-code" };
  }
  try {
    await db.batch([
      db.prepare("UPDATE users SET email = ? WHERE id = ?").bind(pending.new_email, userId),
      db.prepare("DELETE FROM email_changes WHERE user_id = ?").bind(userId),
      db
        .prepare("UPDATE magic_links SET used_at = ? WHERE email = ? AND used_at IS NULL")
        .bind(Date.now(), current.email),
    ]);
  } catch (err) {
    // Adresse prise entre la demande et la confirmation (l'index unique de
    // users.email fait foi).
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      return { ok: false, reason: "taken" };
    }
    throw err;
  }
  return { ok: true, oldEmail: current.email, newEmail: pending.new_email };
}

export async function isEmailUsedByAnotherUser(
  db: D1Database,
  email: string,
  userId: number
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number }>();
  return !!row && row.id !== userId;
}

export function sendEmailChangeCode(
  env: Env,
  newEmail: string,
  code: string,
  locale: EmailLocale
): Promise<{ skipped: boolean }> {
  const content = EMAIL_CHANGE_CODE_CONTENT[locale];
  return sendEmail(env, newEmail, content.subject, content.html(code));
}

export function sendEmailChangedNotice(
  env: Env,
  oldEmail: string,
  newEmail: string,
  locale: EmailLocale
): Promise<{ skipped: boolean }> {
  const content = EMAIL_CHANGED_NOTICE_CONTENT[locale];
  return sendEmail(env, oldEmail, content.subject, content.html(newEmail));
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
  code: string,
  locale: EmailLocale
): Promise<{ skipped: boolean }> {
  const content = MAGIC_LINK_EMAIL_CONTENT[locale];
  return sendEmail(env, email, content.subject, content.html(link, code));
}

async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string
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
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Échec de l'envoi de l'email (${res.status}) : ${await res.text().catch(() => "")}`
    );
  }
  return { skipped: false };
}
