// Provisionne (ou nettoie) une base D1 dédiée à la preview d'une PR, pour
// pouvoir tester une migration de schéma en conditions réelles avant merge
// (voir ticket Trello "Infra : base D1 isolée par preview").
//
// Le plan D1 gratuit limite le compte à 10 bases au total (voir
// developers.cloudflare.com/d1/platform/limits) ; une est réservée à la prod
// (`bobine-notifications`), donc au plus MAX_PREVIEW_DATABASES previews
// peuvent coexister. Au-delà, `provision` patiente qu'une place se libère
// (fermeture/merge d'une autre PR) plutôt que d'échouer immédiatement, comme
// demandé sur le ticket.
//
// `provision` génère un fichier de config wrangler dérivé de wrangler.jsonc
// (mêmes bindings/assets/vars, seul le binding D1 "DB" pointe vers la base de
// preview) : c'est ce fichier que le workflow passe ensuite à
// `wrangler versions upload --config` pour déployer la preview branchée sur
// sa propre base.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const WRANGLER_BIN = "node_modules/.bin/wrangler";
const SOURCE_CONFIG_PATH = "wrangler.jsonc";
const PREVIEW_CONFIG_PATH = "wrangler.preview.generated.jsonc";
const PROD_DATABASE_NAME = "bobine-notifications";
const PREVIEW_DATABASE_PREFIX = "bobine-preview-pr-";
const MAX_PREVIEW_DATABASES = 9; // 10 max du plan gratuit, moins la base de prod
const POLL_INTERVAL_SECONDS = 30;
const MAX_WAIT_MINUTES = 15;

interface D1Database {
  uuid: string;
  name: string;
}

function dbNameForPr(prNumber: string): string {
  return `${PREVIEW_DATABASE_PREFIX}${prNumber}`;
}

function listDatabases(): D1Database[] {
  const out = execFileSync(WRANGLER_BIN, ["d1", "list", "--json"], { encoding: "utf8" });
  return JSON.parse(out) as D1Database[];
}

function sleepSeconds(seconds: number): void {
  execFileSync("sleep", [String(seconds)]);
}

function createDatabase(dbName: string): string {
  // `wrangler d1 create` n'a pas de sortie --json : on récupère l'UUID créé
  // dans le snippet de config qu'elle imprime toujours sur stdout (au format
  // JSON puisque wrangler.jsonc est un fichier JSON/JSONC).
  const output = execFileSync(WRANGLER_BIN, ["d1", "create", dbName], { encoding: "utf8" });
  const match = /"database_id":\s*"([0-9a-f-]+)"/i.exec(output);
  if (!match) {
    throw new Error(`Impossible de récupérer l'UUID de la base '${dbName}' créée :\n${output}`);
  }
  return match[1];
}

function writePreviewConfig(dbName: string, uuid: string): void {
  const original = readFileSync(SOURCE_CONFIG_PATH, "utf8");
  const withDatabaseName = original.replace(
    `"database_name": "${PROD_DATABASE_NAME}"`,
    `"database_name": "${dbName}"`
  );
  if (withDatabaseName === original) {
    throw new Error(
      `Binding D1 de prod ('${PROD_DATABASE_NAME}') introuvable dans ${SOURCE_CONFIG_PATH}.`
    );
  }
  const updated = withDatabaseName.replace(
    /"database_id":\s*"[0-9a-f-]+"/i,
    `"database_id": "${uuid}"`
  );
  writeFileSync(PREVIEW_CONFIG_PATH, updated);
}

function provision(prNumber: string): void {
  const dbName = dbNameForPr(prNumber);
  const deadline = Date.now() + MAX_WAIT_MINUTES * 60_000;
  let uuid: string | undefined;

  while (uuid === undefined) {
    const databases = listDatabases();
    const existing = databases.find((db) => db.name === dbName);
    if (existing) {
      console.log(`Base de preview '${dbName}' déjà provisionnée (réutilisation).`);
      uuid = existing.uuid;
      break;
    }

    const previewCount = databases.filter((db) =>
      db.name.startsWith(PREVIEW_DATABASE_PREFIX)
    ).length;
    if (previewCount < MAX_PREVIEW_DATABASES) {
      console.log(
        `Création de la base de preview '${dbName}' (${previewCount}/${MAX_PREVIEW_DATABASES} utilisées)...`
      );
      uuid = createDatabase(dbName);
      break;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Plan D1 gratuit saturé (${MAX_PREVIEW_DATABASES} previews max) depuis plus de ${MAX_WAIT_MINUTES} min, ` +
          `abandon. Une autre PR doit être fermée/mergée pour libérer une place.`
      );
    }
    console.log(
      `Plan D1 saturé (${previewCount}/${MAX_PREVIEW_DATABASES} previews en cours) : nouvelle tentative dans ${POLL_INTERVAL_SECONDS}s...`
    );
    sleepSeconds(POLL_INTERVAL_SECONDS);
  }

  writePreviewConfig(dbName, uuid);
  console.log(`Application des migrations sur '${dbName}'...`);
  execFileSync(
    WRANGLER_BIN,
    ["d1", "migrations", "apply", dbName, "--remote", "--config", PREVIEW_CONFIG_PATH],
    {
      stdio: "inherit",
    }
  );
}

function cleanup(prNumber: string): void {
  const dbName = dbNameForPr(prNumber);
  const databases = listDatabases();
  if (!databases.some((db) => db.name === dbName)) {
    console.log(`Aucune base de preview à nettoyer pour cette PR ('${dbName}' n'existe pas).`);
    return;
  }
  console.log(`Suppression de la base de preview '${dbName}'...`);
  execFileSync(WRANGLER_BIN, ["d1", "delete", dbName, "--skip-confirmation"], { stdio: "inherit" });
}

const [, , command, prNumber] = process.argv;
if (!prNumber) {
  console.error("Usage: node scripts/preview-d1.ts <provision|cleanup> <numéro-de-pr>");
  process.exit(1);
}

switch (command) {
  case "provision":
    provision(prNumber);
    break;
  case "cleanup":
    cleanup(prNumber);
    break;
  default:
    console.error(`Commande inconnue : '${command}' (attendu : provision | cleanup)`);
    process.exit(1);
}
