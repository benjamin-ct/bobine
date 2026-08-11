// Authentification par lien magique (pas de mot de passe) + sessions.
//
// Flux :
//  1. POST /api/auth/request-link { email } -> jeton à usage unique stocké
//     en base (15 min), envoyé par email via Resend.
//  2. L'utilisateur clique le lien, arrive sur /auth/verify?token=... côté
//     app (route SPA, pas un endpoint direct — voir plus bas pourquoi).
//  3. La page appelle POST /api/auth/verify { token } : le jeton est
//     consommé, l'utilisateur est créé s'il n'existait pas, une session
//     (30 jours) est créée et posée en cookie httpOnly.

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "bobine_session";

function randomToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function createMagicLink(db, email) {
  const token = randomToken();
  await db
    .prepare("INSERT INTO magic_links (token, email, expires_at, used_at) VALUES (?, ?, ?, NULL)")
    .bind(token, email, Date.now() + MAGIC_LINK_TTL_MS)
    .run();
  return token;
}

// Consomme le jeton (marque used_at) et renvoie l'email associé, ou null si
// le jeton est invalide, expiré, ou déjà utilisé.
async function consumeMagicLink(db, token) {
  const row = await db
    .prepare("SELECT email, expires_at, used_at FROM magic_links WHERE token = ?")
    .bind(token)
    .first();
  if (!row || row.used_at || row.expires_at < Date.now()) return null;
  await db.prepare("UPDATE magic_links SET used_at = ? WHERE token = ?").bind(Date.now(), token).run();
  return row.email;
}

async function findOrCreateUser(db, email) {
  const existing = await db.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
  if (existing) return existing;
  const result = await db
    .prepare("INSERT INTO users (email, created_at) VALUES (?, ?)")
    .bind(email, Date.now())
    .run();
  return { id: result.meta.last_row_id, email };
}

async function createSession(db, userId) {
  const token = randomToken();
  await db
    .prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(token, userId, Date.now() + SESSION_TTL_MS, Date.now())
    .run();
  return token;
}

async function deleteSession(db, token) {
  await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

function parseCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

async function getUserFromRequest(db, request) {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT users.id, users.email, sessions.expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .bind(token)
    .first();
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, email: row.email, sessionToken: token };
}

// `Secure` casse les cookies en local http (wrangler dev sans --local-protocol
// https) : on ne l'ajoute que si la requête est bien passée en https.
function sessionCookieHeader(request, token, { clear = false } = {}) {
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
// sans vraie boîte mail (voir handleRequestLink dans index.js) — en
// production, RESEND_API_KEY est toujours configurée donc ce cas ne se
// présente jamais côté déployé.
async function sendMagicLinkEmail(env, email, link) {
  if (!env.RESEND_API_KEY) return { skipped: true };

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
        <p>Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
      `,
    }),
  });
  if (!res.ok) {
    throw new Error(`Échec de l'envoi de l'email (${res.status}) : ${await res.text().catch(() => "")}`);
  }
  return { skipped: false };
}

export {
  isValidEmail,
  createMagicLink,
  consumeMagicLink,
  findOrCreateUser,
  createSession,
  deleteSession,
  getUserFromRequest,
  sessionCookieHeader,
  sendMagicLinkEmail,
};
