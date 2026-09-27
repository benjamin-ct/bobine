// Environnement de test partagé (carte Trello "Environnement de test") : un
// Worker à part, `bobine-staging`, branché sur sa propre base D1
// (`bobine-staging`) qui contient une copie de la base de prod.
// Lancé par le workflow .github/workflows/staging.yml (déclenchement manuel).
//
// Connexion avec des adresses fictives : le Worker de staging n'a pas de
// RESEND_API_KEY, donc le lien et le code de connexion sont affichés
// directement à l'écran (même repli qu'en dev local, voir
// handleRequestLink dans worker/index.ts) — n'importe quelle adresse, réelle
// ou non, permet de se connecter sans boîte mail. Les comptes copiés depuis
// la prod gardent leur vraie adresse (décision du ticket : pas
// d'anonymisation) : la saisir permet de se connecter sur le compte copié.
//
// Commandes :
//   copy-db : exporte la base de prod, recrée la base de staging à partir de
//             cet export puis neutralise les abonnements push (voir
//             NEUTRALIZE_PUSH_SQL).
//   config  : génère wrangler.staging.generated.jsonc (Worker bobine-staging
//             branché sur la base de staging) et y applique les migrations
//             pas encore jouées.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { experimental_readRawConfig } from "wrangler";

const WRANGLER_BIN = "node_modules/.bin/wrangler";
const SOURCE_CONFIG_PATH = "wrangler.jsonc";
const STAGING_CONFIG_PATH = "wrangler.staging.generated.jsonc";
const PROD_DATABASE_NAME = "bobine-notifications";
const STAGING_DATABASE_NAME = "bobine-staging";
const STAGING_WORKER_NAME = "bobine-staging";

// Les données sont copiées telles quelles (adresses, pseudos, sessions...),
// sauf les abonnements push : sans ça, une action faite sur le staging
// (ex. suivre un profil copié) enverrait une vraie notification sur le
// téléphone de l'utilisateur de prod dès que VAPID_PRIVATE_KEY y est
// configurée.
const NEUTRALIZE_PUSH_SQL = `
UPDATE subscriptions
  SET endpoint = 'https://push.invalid/staging/' || id, p256dh = '', auth = '', sync_host = NULL;
UPDATE reminders SET sync_host = NULL;
`;

interface D1Binding {
  binding: string;
  database_name: string;
  database_id: string;
}
interface SourceConfig {
  name?: string;
  vars?: Record<string, unknown>;
  d1_databases?: D1Binding[];
  [key: string]: unknown;
}
interface D1Database {
  uuid: string;
  name: string;
}

function wrangler(args: string[]): string {
  return execFileSync(WRANGLER_BIN, args, { encoding: "utf8" });
}

function findDatabase(name: string): D1Database | undefined {
  const databases = JSON.parse(wrangler(["d1", "list", "--json"])) as D1Database[];
  return databases.find((db) => db.name === name);
}

function createDatabase(name: string): string {
  // Même extraction que scripts/preview-d1.ts : `wrangler d1 create` n'a pas
  // de sortie --json.
  const output = wrangler(["d1", "create", name]);
  const match = /"database_id":\s*"([0-9a-f-]+)"/i.exec(output);
  if (!match) {
    throw new Error(`Impossible de récupérer l'UUID de la base '${name}' créée :\n${output}`);
  }
  return match[1];
}

// `wrangler d1 export` écrit chaque table suivie de ses données, dans
// l'ordre de création des tables : `subscriptions` (migration 0001) et ses
// lignes arrivent avant `users`, alors qu'une de ses colonnes y fait
// référence (migration 0008). À l'import, insérer une ligne dont la table
// parente n'existe pas encore échoue avec "no such table: main.users",
// même avec defer_foreign_keys. On crée donc tout le schéma avant d'insérer
// les données (ordre relatif conservé), les clés étrangères n'étant vérifiées
// qu'à la fin grâce au defer_foreign_keys de l'export. Chaque INSERT tient sur
// une ligne : l'export encode les retours à la ligne des chaînes
// (replace(..., '\n', char(10))).
function schemaFirst(dump: string): string {
  const schema: string[] = [];
  const data: string[] = [];
  for (const line of dump.split("\n")) {
    (line.startsWith("INSERT INTO ") ? data : schema).push(line);
  }
  return [...schema, ...data].join("\n");
}

function copyDb(): void {
  // L'export contient des données personnelles : il reste dans un dossier
  // temporaire du runner, supprimé dans tous les cas, jamais publié en
  // artefact.
  const workDir = mkdtempSync(join(tmpdir(), "bobine-staging-"));
  try {
    const dumpPath = join(workDir, "prod.sql");
    console.log(`Export de la base de prod '${PROD_DATABASE_NAME}'...`);
    wrangler(["d1", "export", PROD_DATABASE_NAME, "--remote", "--output", dumpPath]);

    // Base recréée de zéro à chaque copie : plus simple et plus sûr que de
    // vider table par table (schéma éventuellement en avance/en retard).
    if (findDatabase(STAGING_DATABASE_NAME)) {
      console.log(`Suppression de l'ancienne base '${STAGING_DATABASE_NAME}'...`);
      wrangler(["d1", "delete", STAGING_DATABASE_NAME, "--skip-confirmation"]);
    }
    console.log(`Création de la base '${STAGING_DATABASE_NAME}'...`);
    createDatabase(STAGING_DATABASE_NAME);

    const importPath = join(workDir, "import.sql");
    writeFileSync(importPath, schemaFirst(readFileSync(dumpPath, "utf8")));
    console.log("Import de la copie...");
    wrangler(["d1", "execute", STAGING_DATABASE_NAME, "--remote", "--yes", "--file", importPath]);

    const neutralizePath = join(workDir, "neutralize-push.sql");
    writeFileSync(neutralizePath, NEUTRALIZE_PUSH_SQL);
    console.log("Neutralisation des abonnements push...");
    wrangler([
      "d1",
      "execute",
      STAGING_DATABASE_NAME,
      "--remote",
      "--yes",
      "--file",
      neutralizePath,
    ]);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function writeConfig(): void {
  const staging = findDatabase(STAGING_DATABASE_NAME);
  if (!staging) {
    throw new Error(
      `Base '${STAGING_DATABASE_NAME}' introuvable : lancer d'abord le workflow avec la copie de la base.`
    );
  }
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

  // Vars : ni le token Web Analytics (pour ne pas mêler le trafic de test aux
  // statistiques de prod) ni la clé reCAPTCHA de site (liée au domaine de
  // prod ; sans RECAPTCHA_SECRET_KEY côté staging, la vérification est
  // sautée). "keep_vars" préserve ce qui serait ajouté depuis le dashboard.
  const {
    CLOUDFLARE_ANALYTICS_TOKEN: _analytics,
    RECAPTCHA_SITE_KEY: _recaptcha,
    ...vars
  } = rawConfig.vars ?? {};
  const stagingConfig = {
    ...rawConfig,
    name: STAGING_WORKER_NAME,
    vars,
    keep_vars: true,
    d1_databases: [
      { ...prodDatabase, database_name: STAGING_DATABASE_NAME, database_id: staging.uuid },
    ],
    // Pas de tâche planifiée : aucune notification ne doit partir du staging.
    triggers: { crons: [] },
  };
  writeFileSync(STAGING_CONFIG_PATH, JSON.stringify(stagingConfig, null, 2) + "\n");

  // No-op juste après une copie (la table d1_migrations fait partie de
  // l'export), utile quand on redéploie le staging sans recopier la base
  // alors que de nouvelles migrations ont été mergées.
  console.log(`Application des migrations sur '${STAGING_DATABASE_NAME}'...`);
  execFileSync(
    WRANGLER_BIN,
    [
      "d1",
      "migrations",
      "apply",
      STAGING_DATABASE_NAME,
      "--remote",
      "--config",
      STAGING_CONFIG_PATH,
    ],
    { stdio: "inherit" }
  );
}

const [, , command] = process.argv;
switch (command) {
  case "copy-db":
    copyDb();
    break;
  case "config":
    writeConfig();
    break;
  default:
    console.error("Usage: node scripts/staging.ts <copy-db|config>");
    process.exit(1);
}
