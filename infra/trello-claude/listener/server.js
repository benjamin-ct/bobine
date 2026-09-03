const http = require("http");
const { exec } = require("child_process");
const fs = require("fs");

const PORT = process.env.PORT || 8080;
const DOCKER_CONTAINER = process.env.DOCKER_CONTAINER || "bobine-repo";
const REPO_PATH = process.env.REPO_PATH || "/workspace";
const LOCK_FILE = "/tmp/claude-trello.lock";
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "1543573331335315497";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const PROMPT = [
  "Traite le board Trello selon le skill trello-ticket-pipeline.",
  "CONTEXTE CRITIQUE : tu es dans une execution one-shot via claude -p ; aucun processus ne reprendra apres ta sortie.",
  "INTERDICTION : ne delegue pas une attente CI a un sous-agent et ne termine jamais en disant que tu seras notifie automatiquement.",
  "Si une CI est queued ou in_progress, reinterroge les check-runs dans cette execution pendant au plus 15 minutes.",
  "Avant toute reponse finale, envoie exactement un resume detaille dans Discord via l’API Discord REST.",
  "Utilise DISCORD_TOKEN pour l’authentification et DISCORD_CHANNEL_ID comme salon cible.",
  "Le message est obligatoire, y compris si la CI est toujours en cours au timeout.",
].join(" ");

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

async function postDiscordMessage(text) {
  if (!DISCORD_WEBHOOK_URL) {
    return;
  }
  const res = await fetch(DISCORD_WEBHOOK_URL, {
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

function triggerClaude(action) {
  const cardId = action?.data?.card?.id;
  const cardName = action?.data?.card?.name;
  if (!cardId || !cardName) {
    console.log(`[${ts()}] [debug] action sans carte, skip`);
    return;
  }
  console.log(`[${ts()}] Declenchement pour "${cardName}" (ID: ${cardId})`);

  const cmd = `docker exec --user claudeuser ${DOCKER_CONTAINER} bash -lc ${JSON.stringify(
    `cd ${REPO_PATH} && git pull --ff-only origin main && claude -p ${JSON.stringify(PROMPT)} --dangerously-skip-permissions --allowedTools 'Bash(git *)' 'Bash(curl *)' Read Write`
  )}`;

  const child = exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, async (err, stdout, stderr) => {
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

    // Gestion explicite de la limite de sessions Claude
    if (stdout && /You've hit your session limit/.test(stdout)) {
      // Ex: "You've hit your session limit · resets 5:10pm (UTC)"
      const match = /resets\s+(\d{1,2}):(\d{2})\s*(am|pm)?\s*(?:\(UTC\))?/i.exec(stdout);
      let resetText = "dans quelques minutes";

      if (match) {
        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        const ampm = (match[3] || "").toLowerCase();

        // Convertir en heure 24h UTC
        if (ampm === "pm" && hour !== 12) {
          hour += 12;
        } else if (ampm === "am" && hour === 12) {
          hour = 0;
        }

        const now = new Date();
        const resetUtc = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0)
        );

        // Si l'heure est déjà passée (en UTC), on suppose que c'est demain (UTC)
        if (resetUtc.getTime() < now.getTime()) {
          resetUtc.setUTCDate(resetUtc.getUTCDate() + 1);
        }

        // Formater en heure Europe/Paris, 24h, avec minutes
        const resetParis = new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris",
          hour: "numeric",
          minute: "2-digit",
          hour12: false,
        }).format(resetUtc);

        resetText = `après ${resetParis} (heure de Paris)`;
      }

      const logMsg = `Limite de sessions Claude atteinte. Réessaie ${resetText}.`;
      console.log(`[${ts()}] ${logMsg}`);

      // Notification Discord uniquement
      try {
        await postDiscordMessage(logMsg);
      } catch (e) {
        console.error(`[${ts()}] [discord] echec notification limite : ${e.message}`);
      }

      return;
    }

    const hasStderr = stderr && stderr.trim().length > 0;

    if (err && hasStderr) {
      console.error(`[${ts()}] Echec execution : ${stderr.slice(0, 1000)}`);
      const errorMsg = `🤖 [Claude] Echec de l'execution : ${stderr.slice(0, 1000)}`;
      if (cardId) {
        try {
          await postTrelloComment(cardId, errorMsg);
        } catch (e) {}
      }
      return;
    }

    if (err) {
      console.error(`[${ts()}] Echec execution : ${err.message || "erreur inconnue"}`);
      const errorMsg = `🤖 [Claude] Echec de l'execution : ${err.message || "erreur inconnue"}`;
      if (cardId) {
        try {
          await postTrelloComment(cardId, errorMsg);
        } catch (e) {}
      }
      return;
    }

    console.log(`[${ts()}] Execution terminee avec succes`);
  });

  fs.writeFileSync(LOCK_FILE, String(child.pid));
}

const server = http.createServer((req, res) => {
  if (req.method === "HEAD") {
    res.writeHead(200);
    return res.end();
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
      triggerClaude(action);
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[${ts()}] Webhook listener Trello → Claude en ecoute sur :${PORT}`);
});
