const http = require("http");
const { execFile } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const DOCKER_CONTAINER = process.env.DOCKER_CONTAINER || "bobine-repo";
const LOCK_FILE = "/tmp/claude-trello.lock";
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const CLAUDE_EFFORT = process.env.CLAUDE_EFFORT || "medium";
// Code de sortie de bobine-claude-run quand une exécution tourne déjà dans bobine-repo.
const EXIT_BUSY = 75;

// Dashboard de suivi (lecture seule, protégé par Basic Auth) : voir README, « Dashboard de
// suivi ». Non configuré par défaut (DASHBOARD_TOKEN vide) pour ne jamais exposer la route sans
// secret. N'appelle jamais `claude -p` : aucune consommation de tokens à la consultation.
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN;
// Dernier run déclenché par ce listener (label, etc.) ; le flock Docker ci-dessous reste la
// seule source fiable pour savoir si une exécution tourne vraiment (il couvre aussi les
// lancements manuels via SSH, que ce fichier ne voit pas).
const CLAUDE_STATUS_FILE = "/tmp/claude-status.json";
const LAST_RUN_LOG_FILE = "/tmp/claude-last-run.log";
const DELEGATED_DEV_LOG_FILE = "/tmp/claude-dev.log";
const BOBINE_CLAUDE_LOCK = "/tmp/bobine-claude-run.lock";

// Relance automatique après la limite d'usage Claude. L'état vit dans /tmp, monté depuis l'hôte :
// il survit à un rebuild/redémarrage du listener, qui reprogramme la relance au démarrage.
const RESUME_STATE_FILE = "/tmp/claude-resume.json";
// Marge après l'heure de reset annoncée, et délai par défaut si cette heure est illisible.
const RESUME_MARGIN_MS = 2 * 60 * 1000;
const RESUME_FALLBACK_MS = 30 * 60 * 1000;
// Relance prévue mais une exécution (lancée à la main) tient encore le verrou : on retente.
const RESUME_BUSY_RETRY_MS = 5 * 60 * 1000;
// Au-delà de ce nombre de relances consécutives qui retombent sur la limite : abandon + alerte.
const MAX_AUTO_RELAUNCHES = 6;
// Message du CLI (« You've hit your session limit · resets 5:10pm (UTC) », variantes usage/weekly)
// ou marqueur écrit par le skill quand c'est le sous-processus de développement qui l'a atteinte.
const USAGE_LIMIT_RE = /hit your (?:\w+ )?limit|usage limit reached|USAGE_LIMIT_REACHED/i;

const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "1543573331335315497";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
// Webhook dédié au salon "erreurs-prod" (id 1544711290273140877), utilisé uniquement pour les
// alertes Sentry — distinct de DISCORD_WEBHOOK_URL pour ne pas mélanger ces alertes avec les
// notifications de fin de pipeline Trello. Retombe sur DISCORD_WEBHOOK_URL si non configuré, pour
// ne pas perdre l'alerte pendant la mise en place du webhook dédié.
const DISCORD_SENTRY_WEBHOOK_URL = process.env.DISCORD_SENTRY_WEBHOOK_URL || DISCORD_WEBHOOK_URL;

const SENTRY_WEBHOOK_SECRET = process.env.SENTRY_WEBHOOK_SECRET;

const PROMPT = [
  "Traite le board Trello selon le skill trello-ticket-pipeline.",
  "CONTEXTE CRITIQUE : tu es dans une execution one-shot via claude -p ; aucun processus ne reprendra apres ta sortie.",
  "INTERDICTION : ne delegue pas une attente CI a un sous-agent et ne termine jamais en disant que tu seras notifie automatiquement.",
  "Si une CI est queued ou in_progress, reinterroge les check-runs dans cette execution pendant au plus 15 minutes.",
  "Avant toute reponse finale, envoie exactement un resume detaille dans Discord via l’API Discord REST.",
  "Utilise DISCORD_TOKEN pour l’authentification et DISCORD_CHANNEL_ID comme salon cible.",
  "Le message est obligatoire, y compris si la CI est toujours en cours au timeout.",
  "CONTRAINTE GIT : tu es dans ton clone de travail dédié (distinct du checkout du serveur), qui part de main à jour. Si tu as besoin d’une branche en particulier, fais toi-même git fetch / git switch / git pull.",
].join(" ");

function sentryPrompt(rawPayload) {
  return [
    "Traite cette alerte Sentry selon le skill sentry-triage.",
    "CONTEXTE CRITIQUE : tu es dans une execution one-shot via claude -p ; aucun processus ne reprendra apres ta sortie.",
    "INTERDICTION : ne delegue pas une attente CI a un sous-agent et ne termine jamais en disant que tu seras notifie automatiquement.",
    "Avant toute reponse finale, envoie un resume dans Discord via l'API Discord REST (DISCORD_TOKEN / DISCORD_CHANNEL_ID).",
    "CONTRAINTE GIT : tu es dans ton clone de travail dédié (distinct du checkout du serveur), qui part de main à jour. Si tu as besoin d'une branche en particulier, fais toi-même git fetch / git switch / git pull.",
    "Voici le payload brut du webhook Sentry (JSON) :",
    rawPayload,
  ].join(" ");
}

function ts() {
  return new Date().toISOString();
}

if (fs.existsSync(LOCK_FILE)) {
  console.log(`[${ts()}] Lock orphelin detecte, suppression.`);
  fs.unlinkSync(LOCK_FILE);
}

function isIgnorable(action) {
  const type = action?.type;
  if (type !== "updateCard") {
    return true;
  }
  const before = action?.data?.listBefore?.name?.toLowerCase() || "";
  const after = action?.data?.listAfter?.name?.toLowerCase() || "";
  if (!before || !after) {
    return true;
  }
  if (after.includes("ideas")) {
    return true;
  }
  if (before.includes("done") || after.includes("done")) {
    return true;
  }
  if (before === "a faire" && after === "en cours") {
    return true;
  }
  if (after.includes("a valider") || after.includes("valider")) {
    return true;
  }
  return false;
}

function isLocked() {
  return fs.existsSync(LOCK_FILE);
}

function writeClaudeStatus(status) {
  try {
    fs.writeFileSync(CLAUDE_STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (e) {
    console.error(`[${ts()}] [dashboard] echec ecriture statut : ${e.message}`);
  }
}

function readClaudeStatus() {
  try {
    return JSON.parse(fs.readFileSync(CLAUDE_STATUS_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function postTrelloComment(cardId, text) {
  if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
    return;
  }
  const url = `https://api.trello.com/1/cards/${cardId}/actions/comments`;
  const params = new URLSearchParams({ key: TRELLO_API_KEY, token: TRELLO_TOKEN, text });
  const res = await fetch(`${url}?${params}`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Trello API error: ${res.status}`);
  }
  return res.json();
}

async function postDiscordMessage(text, webhookUrl = DISCORD_WEBHOOK_URL) {
  if (!webhookUrl) {
    return;
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook error: ${res.status}`);
  }
  const raw = await res.text();
  if (!raw) {
    return;
  }
  return JSON.parse(raw);
}

// notify : à qui signaler un échec ({ type: "trello", cardId } ou { type: "sentry", issueLabel }),
// sérialisable pour être rejoué par une relance automatique. relaunch : numéro de la relance
// automatique (0 pour un déclenchement normal).
function runClaude(label, prompt, notify, relaunch = 0) {
  console.log(`[${ts()}] Declenchement pour ${label}${relaunch ? ` (relance ${relaunch})` : ""}`);
  const onError = (errorMsg) => notifyError(notify, errorMsg);
  const runPrompt = relaunch ? `${prompt} ${relaunchNote(relaunch)}` : prompt;

  // Statut best-effort pour le dashboard (voir README, « Dashboard de suivi ») : ne couvre que
  // les déclenchements passés par ce listener (pas un `claude -p` lancé à la main en SSH), d'où
  // le flock Docker en complément dans l'API du dashboard pour savoir si une exécution tourne
  // *vraiment* en ce moment.
  const startedAt = ts();
  writeClaudeStatus({ running: true, label, relaunch, startedAt });

  // bobine-claude-run (voir bobine-repo/) prépare le clone de travail dédié de Claude puis lance
  // `claude -p`. execFile : le prompt (payload Sentry compris) est passé tel quel, sans shell.
  const args = [
    "exec",
    "--user",
    "claudeuser",
    "--env",
    `CLAUDE_MODEL=${CLAUDE_MODEL}`,
    "--env",
    `CLAUDE_EFFORT=${CLAUDE_EFFORT}`,
    DOCKER_CONTAINER,
    "bobine-claude-run",
    runPrompt,
  ];

  const child = execFile(
    "docker",
    args,
    { maxBuffer: 1024 * 1024 * 50 },
    async (err, stdout, stderr) => {
      if (fs.existsSync(LOCK_FILE)) {
        fs.unlinkSync(LOCK_FILE);
      }

      // Log stdout/stderr dans un fichier pour inspection
      const logPath = "/tmp/claude-last-run.log";
      const logContent = [
        "=== STDOUT ===",
        stdout || "",
        "=== STDERR ===",
        stderr || "",
        "=== ERR ===",
        err
          ? JSON.stringify({ message: err.message, code: err.code, signal: err.signal }, null, 2)
          : "null",
      ].join("\n");
      fs.writeFileSync(logPath, logContent);

      console.log(`[${ts()}] [debug] stdout length: ${stdout?.length || 0}`);
      console.log(`[${ts()}] [debug] stderr length: ${stderr?.length || 0}`);
      console.log(`[${ts()}] [debug] err.message: ${err?.message || "null"}`);
      console.log(`[${ts()}] [debug] err.code: ${err?.code || "null"}`);
      console.log(`[${ts()}] [debug] err.signal: ${err?.signal || "null"}`);
      console.log(`[${ts()}] [debug] err.cmd: ${err?.cmd || "null"}`);

      // Limite d'usage Claude : relance programmée après le reset au lieu d'un simple message.
      const output = `${stdout || ""}\n${stderr || ""}`;
      if (USAGE_LIMIT_RE.test(output)) {
        writeClaudeStatus({
          running: false,
          label,
          relaunch,
          startedAt,
          finishedAt: ts(),
          outcome: "usage_limit",
        });
        await handleUsageLimit({ label, prompt, notify, relaunch, output });
        return;
      }

      if (err?.code === EXIT_BUSY) {
        console.log(
          `[${ts()}] Execution Claude deja en cours dans ${DOCKER_CONTAINER}, declenchement ignore`
        );
        writeClaudeStatus({
          running: false,
          label,
          relaunch,
          startedAt,
          finishedAt: ts(),
          outcome: "busy",
        });
        return;
      }

      const hasStderr = stderr && stderr.trim().length > 0;

      if (err && hasStderr) {
        console.error(`[${ts()}] Echec execution : ${stderr.slice(0, 1000)}`);
        const errorMsg = `🤖 [Claude] Echec de l'execution : ${stderr.slice(0, 1000)}`;
        writeClaudeStatus({
          running: false,
          label,
          relaunch,
          startedAt,
          finishedAt: ts(),
          outcome: "error",
        });
        try {
          await onError(errorMsg);
        } catch (e) {}
        return;
      }

      if (err) {
        console.error(`[${ts()}] Echec execution : ${err.message || "erreur inconnue"}`);
        const errorMsg = `🤖 [Claude] Echec de l'execution : ${err.message || "erreur inconnue"}`;
        writeClaudeStatus({
          running: false,
          label,
          relaunch,
          startedAt,
          finishedAt: ts(),
          outcome: "error",
        });
        try {
          await onError(errorMsg);
        } catch (e) {}
        return;
      }

      console.log(`[${ts()}] Execution terminee avec succes`);
      writeClaudeStatus({
        running: false,
        label,
        relaunch,
        startedAt,
        finishedAt: ts(),
        outcome: "success",
      });
      if (relaunch) {
        await postDiscordMessage(
          `▶️ Relance automatique ${relaunch}/${MAX_AUTO_RELAUNCHES} terminée (${label}) : le pipeline a repris normalement.`
        ).catch((e) =>
          console.error(`[${ts()}] [discord] echec notification reprise : ${e.message}`)
        );
      }
    }
  );

  fs.writeFileSync(LOCK_FILE, String(child.pid));
}

function notifyError(notify, errorMsg) {
  if (notify?.type === "trello") {
    return postTrelloComment(notify.cardId, errorMsg);
  }
  return postDiscordMessage(
    `${errorMsg}\n(déclenché par l'alerte Sentry : ${notify?.issueLabel})`,
    DISCORD_SENTRY_WEBHOOK_URL
  );
}

function triggerClaude(action) {
  const cardId = action?.data?.card?.id;
  const cardName = action?.data?.card?.name;
  if (!cardId || !cardName) {
    console.log(`[${ts()}] [debug] action sans carte, skip`);
    return;
  }
  runClaude(`"${cardName}" (ID: ${cardId})`, PROMPT, { type: "trello", cardId });
}

function triggerClaudeForSentry(rawPayload, issueLabel) {
  runClaude(`alerte Sentry (${issueLabel})`, sentryPrompt(rawPayload), {
    type: "sentry",
    issueLabel,
  });
}

// --- Limite d'usage : lecture de l'heure de reset ---------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Décalage (ms) du fuseau timeZone par rapport à UTC à l'instant utcMs (heure d'été comprise).
function tzOffsetMs(utcMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, Number(p.value)])
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Heure murale (année, mois 0-11, jour, h, min) dans timeZone → instant UTC (ms). Deux passes :
// le décalage peut changer entre l'estimation et l'heure visée (jour de passage à l'heure d'été).
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const wall = Date.UTC(year, month, day, hour, minute);
  const estimate = wall - tzOffsetMs(wall, timeZone);
  return wall - tzOffsetMs(estimate, timeZone);
}

function todayIn(timeZone, now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)])
  );
  return { year: parts.year, month: parts.month - 1, day: parts.day };
}

// Lit l'heure de reset dans la sortie du CLI, ex. « resets 5:10pm (UTC) », « resets 3am
// (Europe/Paris) », « resets Oct 3, 5pm (America/New_York) ». Sans fuseau : UTC. Renvoie
// l'instant UTC (ms) du prochain reset, ou null si illisible.
function parseResetTime(output, now = new Date()) {
  const match =
    /resets\s+(?:at\s+)?(?:([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([^)]+)\))?/i.exec(
      output
    );
  if (!match) {
    return null;
  }
  const [, monthName, dayText, hourText, minuteText, ampm, tzText] = match;
  let hour = parseInt(hourText, 10);
  const minute = minuteText ? parseInt(minuteText, 10) : 0;
  if (ampm) {
    if (hour < 1 || hour > 12) {
      return null;
    }
    hour = (hour % 12) + (ampm.toLowerCase() === "pm" ? 12 : 0);
  }
  if (hour > 23 || minute > 59) {
    return null;
  }
  const timeZone = !tzText || /^utc$/i.test(tzText.trim()) ? "UTC" : tzText.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return null;
  }

  if (monthName) {
    const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
    if (month < 0) {
      return null;
    }
    const { year } = todayIn(timeZone, now);
    let reset = zonedTimeToUtc(year, month, parseInt(dayText, 10), hour, minute, timeZone);
    // Date de janvier lue en décembre : c'est l'année suivante.
    if (reset < now.getTime() - 24 * 3600 * 1000) {
      reset = zonedTimeToUtc(year + 1, month, parseInt(dayText, 10), hour, minute, timeZone);
    }
    return reset;
  }

  // Heure seule : aujourd'hui dans ce fuseau, ou demain si elle est déjà passée.
  const today = todayIn(timeZone, now);
  let reset = zonedTimeToUtc(today.year, today.month, today.day, hour, minute, timeZone);
  if (reset <= now.getTime()) {
    reset = zonedTimeToUtc(today.year, today.month, today.day + 1, hour, minute, timeZone);
  }
  return reset;
}

function formatParis(utcMs) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(utcMs));
}

// --- Limite d'usage : relance programmée --------------------------------------------------------

let resumeTimer = null;

function readResumeState() {
  try {
    return JSON.parse(fs.readFileSync(RESUME_STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeResumeState(state) {
  fs.writeFileSync(RESUME_STATE_FILE, JSON.stringify(state, null, 2));
}

function clearResumeState() {
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
  fs.rmSync(RESUME_STATE_FILE, { force: true });
}

// Vrai tant qu'une relance est programmée : les webhooks Trello/Sentry ne relancent pas Claude
// (ils retomberaient sur la limite), la relance traitera tout le board de toute façon.
function isWaitingForReset() {
  return resumeTimer !== null || fs.existsSync(RESUME_STATE_FILE);
}

function relaunchNote(relaunch) {
  return [
    `RELANCE AUTOMATIQUE (${relaunch}/${MAX_AUTO_RELAUNCHES}) : l'exécution précédente s'est arrêtée sur la limite d'usage Claude.`,
    "Reprends le travail là où il s'est arrêté (carte restée en En cours, commits wip: sur sa branche, note REPRISE éventuelle) au lieu de repartir de zéro, puis continue le board normalement.",
  ].join(" ");
}

function scheduleResume(state) {
  if (resumeTimer) {
    clearTimeout(resumeTimer);
  }
  const delay = Math.max(new Date(state.resumeAt).getTime() - Date.now(), 0);
  console.log(
    `[${ts()}] Relance ${state.relaunch}/${MAX_AUTO_RELAUNCHES} programmee a ${state.resumeAt}`
  );
  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    if (isLocked()) {
      const retryAt = new Date(Date.now() + RESUME_BUSY_RETRY_MS).toISOString();
      console.log(
        `[${ts()}] Relance reportee : execution deja en cours, nouvel essai a ${retryAt}`
      );
      const next = { ...state, resumeAt: retryAt };
      writeResumeState(next);
      scheduleResume(next);
      return;
    }
    // L'état est retiré au lancement : si la relance retombe sur la limite, handleUsageLimit en
    // réécrit un avec le compteur incrémenté.
    clearResumeState();
    runClaude(state.label, state.prompt, state.notify, state.relaunch);
  }, delay);
}

async function handleUsageLimit({ label, prompt, notify, relaunch, output }) {
  const discord = (text) =>
    postDiscordMessage(text).catch((e) =>
      console.error(`[${ts()}] [discord] echec notification limite : ${e.message}`)
    );

  if (relaunch >= MAX_AUTO_RELAUNCHES) {
    clearResumeState();
    const msg = `🚨 Limite d'usage Claude toujours atteinte après ${MAX_AUTO_RELAUNCHES} relances automatiques consécutives (${label}). Abandon : relancer à la main (déplacer une carte ou bobine-logs pour le détail).`;
    console.error(`[${ts()}] ${msg}`);
    await discord(msg);
    return;
  }

  const resetAt = parseResetTime(output);
  const resumeAt = resetAt ? resetAt + RESUME_MARGIN_MS : Date.now() + RESUME_FALLBACK_MS;
  const state = {
    label,
    prompt,
    notify,
    relaunch: relaunch + 1,
    resetAt: resetAt ? new Date(resetAt).toISOString() : null,
    resumeAt: new Date(resumeAt).toISOString(),
  };
  writeResumeState(state);
  scheduleResume(state);

  const resetText = resetAt
    ? `reset à ${formatParis(resetAt)} (heure de Paris)`
    : "heure de reset illisible";
  const msg = `⏸️ Limite d'usage Claude atteinte (${label}) : ${resetText}. Relance automatique ${state.relaunch}/${MAX_AUTO_RELAUNCHES} prévue à ${formatParis(resumeAt)} ; les webhooks Trello/Sentry sont ignorés d'ici là.`;
  console.log(`[${ts()}] ${msg}`);
  await discord(msg);
}

// --- Dashboard de suivi (lecture seule) ---------------------------------------------------

function tailFile(path, maxLines) {
  let content;
  try {
    content = fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const lines = content.split("\n");
  return lines.slice(-maxLines).join("\n");
}

// flock du même verrou que `bobine-claude-busy` (voir bobine-shell.sh) : seule source fiable
// pour savoir si une exécution tourne *vraiment*, y compris un `claude -p` lancé à la main en
// SSH (que CLAUDE_STATUS_FILE ne voit pas). null = conteneur bobine-repo inaccessible.
function checkClaudeBusy() {
  return new Promise((resolve) => {
    execFile(
      "docker",
      [
        "exec",
        "--user",
        "claudeuser",
        DOCKER_CONTAINER,
        "flock",
        "-n",
        "-E",
        "75",
        BOBINE_CLAUDE_LOCK,
        "true",
      ],
      { timeout: 5000 },
      (err) => {
        if (!err) {
          return resolve(false);
        }
        if (err.code === 75) {
          return resolve(true);
        }
        resolve(null);
      }
    );
  });
}

// Branche/commit du clone de travail de Claude (volume `claude-workspace`, pas monté dans ce
// conteneur) : best-effort, ne doit jamais faire échouer le dashboard.
function getWorkspaceGitInfo() {
  return new Promise((resolve) => {
    execFile(
      "docker",
      [
        "exec",
        "--user",
        "claudeuser",
        DOCKER_CONTAINER,
        "bash",
        "-lc",
        "cd /workspace && git branch --show-current && git log -1 --format=%h\\ %s",
      ],
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout) {
          return resolve(null);
        }
        const [branch, ...rest] = stdout.trim().split("\n");
        resolve({ branch: branch || null, commit: rest.join(" ").trim() || null });
      }
    );
  });
}

async function buildDashboardStatus() {
  const [busy, workspace] = await Promise.all([checkClaudeBusy(), getWorkspaceGitInfo()]);
  return {
    generatedAt: ts(),
    running: busy,
    current: readClaudeStatus(),
    resume: readResumeState(),
    workspace,
    lastRunLog: tailFile(LAST_RUN_LOG_FILE, 200),
    delegatedDevLog: tailFile(DELEGATED_DEV_LOG_FILE, 200),
  };
}

// Basic Auth : utilisateur fixe "claude", mot de passe = DASHBOARD_TOKEN. Pas configuré par
// défaut (voir .env.example) : la route renvoie alors 503 plutôt que de s'ouvrir sans secret.
function isDashboardAuthorized(req) {
  const header = req.headers.authorization || "";
  const expected = `Basic ${Buffer.from(`claude:${DASHBOARD_TOKEN}`).toString("base64")}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  // Comparaison à temps constant (longueur comprise) : évite de fuiter le secret par timing.
  return headerBuf.length === expectedBuf.length && crypto.timingSafeEqual(headerBuf, expectedBuf);
}

function requireDashboardAuth(req, res) {
  if (!DASHBOARD_TOKEN) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Dashboard non configuré : DASHBOARD_TOKEN manquant côté serveur.");
    return false;
  }
  if (!isDashboardAuthorized(req)) {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="Dashboard Claude"',
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("Authentification requise.");
    return false;
  }
  return true;
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Dashboard Claude — Bobine</title>
<style>
  :root {
    color-scheme: dark;
    --surface-1: #1a1a19;
    --page: #0d0d0d;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --muted: #898781;
    --border: rgba(255, 255, 255, 0.1);
    --good: #0ca30c;
    --warning: #fab219;
    --critical: #e66767;
    --info: #3987e5;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 24px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .tile {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .tile .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  .tile .value { font-size: 16px; margin-top: 6px; display: flex; align-items: center; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .dot.good { background: var(--good); }
  .dot.warning { background: var(--warning); }
  .dot.critical { background: var(--critical); }
  .dot.info { background: var(--info); }
  .tile .detail { color: var(--text-secondary); font-size: 12px; margin-top: 6px; }
  .logs { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); }
  .log-block h2 { font-size: 13px; color: var(--text-secondary); margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  pre {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    max-height: 420px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }
  .empty { color: var(--muted); }
  footer { color: var(--muted); font-size: 11px; margin-top: 20px; }
</style>
</head>
<body>
  <h1>Dashboard Claude — Bobine</h1>
  <div class="sub">Suivi en lecture seule du pipeline Trello → Claude. Rafraîchi toutes les 5 s. Aucune action déclenchée ici ne consomme de tokens.</div>
  <div class="tiles" id="tiles"></div>
  <div class="logs">
    <div class="log-block">
      <h2>Dernière exécution (session principale)</h2>
      <pre id="lastRunLog" class="empty">Aucun run enregistré pour l'instant.</pre>
    </div>
    <div class="log-block">
      <h2>Développeur délégué (si en cours)</h2>
      <pre id="devLog" class="empty">Aucune délégation en cours.</pre>
    </div>
  </div>
  <footer id="generatedAt"></footer>
  <script>
    function esc(s) {
      return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    }
    function tile(label, dotClass, value, detail) {
      return '<div class="tile"><div class="label">' + esc(label) + '</div>' +
        '<div class="value"><span class="dot ' + dotClass + '"></span>' + esc(value) + '</div>' +
        (detail ? '<div class="detail">' + esc(detail) + '</div>' : '') + '</div>';
    }
    async function refresh() {
      let data;
      try {
        // location.origin (sans les identifiants) : si la page a été ouverte via une URL du
        // type http://user:pass@hote/dashboard (pratique courante pour une Basic Auth mise en
        // favori), un chemin relatif résolu contre location.href échoue — le Fetch standard
        // interdit de construire une requête depuis une URL contenant des identifiants.
        const res = await fetch(location.origin + '/dashboard/api/status', { cache: 'no-store' });
        if (res.status === 401) {
          document.body.innerHTML = '<p>Authentification requise — rechargez la page.</p>';
          return;
        }
        data = await res.json();
      } catch (e) {
        document.getElementById('tiles').innerHTML = tile('Dashboard', 'critical', '⚠ injoignable', String(e));
        return;
      }

      const tiles = [];
      if (data.running === true) {
        tiles.push(tile('Statut', 'info', '▶ En cours', data.current ? data.current.label : 'Exécution active (déclenchée manuellement)'));
      } else if (data.running === false) {
        tiles.push(tile('Statut', 'good', '✓ Inactif', 'Prêt à traiter le prochain événement.'));
      } else {
        tiles.push(tile('Statut', 'critical', '⚠ Infra inaccessible', 'docker exec vers bobine-repo a échoué.'));
      }

      if (data.resume) {
        tiles.push(tile(
          'Relance programmée',
          'warning',
          '⏸ Limite d\\'usage',
          'Relance ' + data.resume.relaunch + '/6 prévue à ' + data.resume.resumeAt
        ));
      }

      if (data.current && data.current.outcome) {
        const outcomeDot = data.current.outcome === 'success' ? 'good' : (data.current.outcome === 'usage_limit' ? 'warning' : 'critical');
        const outcomeIcon = data.current.outcome === 'success' ? '✓' : (data.current.outcome === 'usage_limit' ? '⏸' : '✗');
        tiles.push(tile('Dernier résultat', outcomeDot, outcomeIcon + ' ' + data.current.outcome, data.current.label + ' — ' + (data.current.finishedAt || '')));
      }

      if (data.workspace) {
        tiles.push(tile('Espace de travail', 'info', data.workspace.branch || '?', data.workspace.commit || ''));
      }

      document.getElementById('tiles').innerHTML = tiles.join('');

      const lastRunEl = document.getElementById('lastRunLog');
      lastRunEl.textContent = data.lastRunLog || 'Aucun run enregistré pour l\\'instant.';
      lastRunEl.classList.toggle('empty', !data.lastRunLog);

      const devEl = document.getElementById('devLog');
      devEl.textContent = data.delegatedDevLog || 'Aucune délégation en cours.';
      devEl.classList.toggle('empty', !data.delegatedDevLog);

      document.getElementById('generatedAt').textContent = 'Dernière actualisation : ' + data.generatedAt;
    }
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.method === "HEAD") {
    res.writeHead(200);
    return res.end();
  }
  if (req.method === "GET" && req.url === "/dashboard") {
    if (!requireDashboardAuth(req, res)) {
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(DASHBOARD_HTML);
  }
  if (req.method === "GET" && req.url === "/dashboard/api/status") {
    if (!requireDashboardAuth(req, res)) {
      return;
    }
    buildDashboardStatus().then((status) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(status));
    });
    return;
  }
  if (req.method === "POST" && req.url === "/trello-webhook") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200);
      res.end("ok");
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        console.error(`[${ts()}] Payload JSON invalide`);
        return;
      }
      const action = payload.action;
      if (isIgnorable(action)) {
        return;
      }
      if (isLocked()) {
        return;
      }
      if (isWaitingForReset()) {
        console.log(`[${ts()}] Relance apres limite d'usage programmee, webhook Trello ignore`);
        return;
      }
      triggerClaude(action);
    });
  } else if (req.method === "POST" && req.url.startsWith("/sentry-webhook")) {
    const { searchParams } = new URL(req.url, `http://localhost:${PORT}`);
    if (!SENTRY_WEBHOOK_SECRET || searchParams.get("secret") !== SENTRY_WEBHOOK_SECRET) {
      console.error(`[${ts()}] /sentry-webhook: secret invalide ou absent`);
      res.writeHead(403);
      return res.end();
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      res.writeHead(200);
      res.end("ok");
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        console.error(`[${ts()}] /sentry-webhook: payload JSON invalide`);
        return;
      }
      const issue = payload?.data?.issue || payload?.data?.event || payload;
      const issueLabel = issue?.title || issue?.culprit || issue?.id || "detail indisponible";
      const issueUrl = issue?.web_url || issue?.url || null;

      try {
        await postDiscordMessage(
          `🚨 Nouvelle alerte Sentry : ${issueLabel}${issueUrl ? `\n${issueUrl}` : ""}`,
          DISCORD_SENTRY_WEBHOOK_URL
        );
      } catch (e) {
        console.error(`[${ts()}] [discord] echec notification alerte Sentry : ${e.message}`);
      }

      if (isLocked()) {
        console.log(
          `[${ts()}] /sentry-webhook: pipeline deja verrouillee, alerte ignoree pour Claude (Discord seul)`
        );
        return;
      }
      if (isWaitingForReset()) {
        console.log(
          `[${ts()}] /sentry-webhook: relance apres limite d'usage programmee, alerte ignoree pour Claude (Discord seul)`
        );
        return;
      }
      triggerClaudeForSentry(JSON.stringify(payload), issueLabel);
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Exporté pour les tests (node -e "require('./server.js')" ne démarre pas le serveur).
module.exports = { parseResetTime, USAGE_LIMIT_RE };

if (require.main === module) {
  // Relance programmée avant un redémarrage/rebuild du listener : on la reprend.
  const pending = readResumeState();
  if (pending?.resumeAt && pending.prompt) {
    scheduleResume(pending);
  }

  server.listen(PORT, () => {
    console.log(`[${ts()}] Webhook listener Trello → Claude en ecoute sur :${PORT}`);
  });
}
