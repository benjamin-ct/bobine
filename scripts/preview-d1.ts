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
// (mêmes assets/vars, binding D1 "DB" pointant vers la base de preview,
// Durable Objects propres à la preview — voir writePreviewConfig) : c'est ce
// fichier que le workflow passe ensuite à `wrangler preview --config` pour
// déployer la preview branchée sur sa propre base.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { experimental_readRawConfig } from "wrangler";

const WRANGLER_BIN = "node_modules/.bin/wrangler";
const SOURCE_CONFIG_PATH = "wrangler.jsonc";
const PREVIEW_CONFIG_PATH = "wrangler.preview.generated.jsonc";
const PROD_DATABASE_NAME = "bobine-notifications";
const PREVIEW_DATABASE_PREFIX = "bobine-preview-pr-";
const MAX_PREVIEW_DATABASES = 9; // 10 max du plan gratuit, moins la base de prod
const POLL_INTERVAL_SECONDS = 30;
const MAX_WAIT_MINUTES = 15;
// Nom du binding (voir worker/types.ts, Env) sous lequel chaque classe
// Durable Object est exposée dans les previews.
const PREVIEW_DURABLE_OBJECT_BINDINGS: Record<string, string> = {
  UserSyncHub: "USER_SYNC_HUB",
};

// Sous-ensemble de wrangler.jsonc lu par writePreviewConfig (le type
// renvoyé par experimental_readRawConfig n'est pas résolu par tsc ici).
interface D1Binding {
  binding: string;
  database_name: string;
  database_id: string;
}
interface SourceConfig {
  vars?: Record<string, unknown>;
  d1_databases?: D1Binding[];
  exports?: Record<string, { type: string }>;
  [key: string]: unknown;
}

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
  const rawConfig = experimental_readRawConfig({ config: SOURCE_CONFIG_PATH })
    .rawConfig as SourceConfig;
  const prodDatabase = rawConfig.d1_databases?.find(
    (db) => db.database_name === PROD_DATABASE_NAME
  );
  if (!prodDatabase) {
    throw new Error(
      `Binding D1 de prod ('${PROD_DATABASE_NAME}') introuvable dans ${SOURCE_CONFIG_PATH}.`
    );
  }
  const previewDatabase = { ...prodDatabase, database_name: dbName, database_id: uuid };

  // Cloudflare Previews (`wrangler preview`) ne publie ni "exports" ni les
  // bindings de premier niveau : seuls "migrations" et le bloc "previews"
  // (bindings propres aux previews) sont envoyés. Les Durable Objects
  // déclarés via "exports" en prod sont donc redéclarés ici par une
  // migration (stockage SQLite, seul disponible sur le plan gratuit) et
  // liés sous "previews.durable_objects" : chaque preview possède alors ses
  // propres instances, isolées de la prod et des autres previews (voir
  // worker/sync.ts, hubFor). "exports" et "migrations" s'excluant
  // mutuellement, "exports" est retiré de la config générée.
  const { exports: workerExports, ...rest } = rawConfig;
  const durableObjectClasses = Object.entries(workerExports ?? {})
    .filter(([, entry]) => entry.type === "durable-object")
    .map(([className]) => className);
  const previewConfig = {
    ...rest,
    d1_databases: [previewDatabase],
    migrations:
      durableObjectClasses.length > 0
        ? [{ tag: "preview-v1", new_sqlite_classes: durableObjectClasses }]
        : [],
    previews: {
      vars: rawConfig.vars ?? {},
      d1_databases: [previewDatabase],
      durable_objects: {
        bindings: durableObjectClasses.map((className) => ({
          name: PREVIEW_DURABLE_OBJECT_BINDINGS[className] ?? className,
          class_name: className,
        })),
      },
    },
  };
  writeFileSync(PREVIEW_CONFIG_PATH, JSON.stringify(previewConfig, null, 2) + "\n");
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
