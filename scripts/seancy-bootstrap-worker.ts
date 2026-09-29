// Bascule Bobine → Seancy (carte Trello « Migrer l'infra vers Seancy ») :
// premier déploiement du Worker `seancy`.
//
// Tant qu'un Worker n'a aucun déploiement (seules des previews), Cloudflare
// grise tous ses réglages (secrets, Previews Base, Build, domaines), et le
// bouton « Modifier le code › Déployer » du dashboard l'est aussi. Ce script,
// lancé par le job "Deploy preview" de ci.yml, déploie donc une fois une
// version provisoire : une réponse 503 fixe, sans URL workers.dev, sans
// domaine ni tâche planifiée, que personne ne voit. Le vrai déploiement
// (Workers Builds, au merge) la remplace en gardant les secrets ajoutés
// entre-temps.
//
// Sans effet dès que le Worker a un déploiement. À supprimer avec
// seancy-copy-d1.ts une fois la bascule terminée.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const WRANGLER_BIN = resolve("node_modules/.bin/wrangler");
const WORKER_NAME = "seancy";

async function deploymentCount(): Promise<number> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${WORKER_NAME}/deployments`,
    { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } }
  );
  // Worker encore inexistant : aucun déploiement non plus.
  if (response.status === 404) {
    return 0;
  }
  const body = (await response.json()) as {
    success: boolean;
    errors?: unknown;
    result?: { deployments: unknown[] };
  };
  if (!response.ok || !body.success || !body.result) {
    throw new Error(
      `Lecture des déploiements de '${WORKER_NAME}' impossible (${response.status}) : ${JSON.stringify(body.errors)}`
    );
  }
  return body.result.deployments.length;
}

function deployPlaceholder(dryRun: boolean): void {
  const dir = mkdtempSync(join(tmpdir(), "seancy-bootstrap-"));
  try {
    writeFileSync(
      join(dir, "index.js"),
      `export default {
  fetch() {
    return new Response("Seancy : version provisoire, en attente du premier vrai déploiement.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
`
    );
    writeFileSync(
      join(dir, "wrangler.json"),
      JSON.stringify({
        name: WORKER_NAME,
        main: "index.js",
        compatibility_date: "2026-08-09",
        // Pas d'adresse workers.dev publique pour cette version ; les URLs
        // de preview restent actives pour les previews de PR.
        workers_dev: false,
        preview_urls: true,
      })
    );
    execFileSync(
      WRANGLER_BIN,
      [
        "deploy",
        "--config",
        join(dir, "wrangler.json"),
        "--message",
        "Version provisoire (déverrouille les réglages du Worker)",
        ...(dryRun ? ["--dry-run"] : []),
      ],
      { stdio: "inherit" }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--dry-run")) {
    deployPlaceholder(true);
    return;
  }
  const count = await deploymentCount();
  if (count > 0) {
    console.log(`Worker '${WORKER_NAME}' déjà déployé (${count} déploiement(s)) : rien à faire.`);
    return;
  }
  deployPlaceholder(false);
  console.log(
    `Worker '${WORKER_NAME}' déployé en version provisoire : ses réglages sont modifiables dans le dashboard.`
  );
}

await main();
