// Bascule Bobine → Seancy (carte Trello « Migrer l'infra vers Seancy ») :
// copie unique de la base de prod `bobine-notifications` vers
// `seancy-notifications`, puis passage de la tâche planifiée (notifications
// du jour) du Worker `bobine` au Worker `seancy`.
//
// Lancé par le job "Apply D1 migrations" de ci.yml à chaque push sur main,
// avant l'application des migrations. Sans effet une fois la bascule faite :
// - copie : seulement si `seancy-notifications` est encore vide (la copie
//   contient la table d1_migrations, donc `migrations apply` n'a ensuite plus
//   rien à faire) ; une base non vide sans d1_migrations fait échouer le job
//   plutôt que d'être écrasée ;
// - tâche planifiée : retirée du Worker `bobine` seulement quand le Worker
//   `seancy` a la sienne, pour qu'aucune journée de notifications ne soit
//   perdue ni envoyée deux fois.
//
// Les deux étapes pourront être supprimées une fois `bobine-notifications`
// et le Worker `bobine` retirés.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const WRANGLER_BIN = "node_modules/.bin/wrangler";
const SOURCE_DATABASE_NAME = "bobine-notifications";
const TARGET_DATABASE_NAME = "seancy-notifications";
const OLD_WORKER_NAME = "bobine";
const NEW_WORKER_NAME = "seancy";
// Juste après la copie, Workers Builds est peut-être encore en train de
// déployer le Worker `seancy` (même push) : on l'attend un peu.
const POLL_INTERVAL_SECONDS = 30;
const MAX_WAIT_MINUTES = 10;

function wrangler(args: string[]): string {
  return execFileSync(WRANGLER_BIN, args, { encoding: "utf8" });
}

// ---------------------------------------------------------------------------
// Copie de la base
// ---------------------------------------------------------------------------

function targetTables(): string[] {
  const output = wrangler([
    "d1",
    "execute",
    TARGET_DATABASE_NAME,
    "--remote",
    "--json",
    "--command",
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
  ]);
  const [result] = JSON.parse(output) as { results: { name: string }[] }[];
  return result.results.map((r) => r.name);
}

interface ForeignKeyRow {
  id: number;
  table: string;
  from: string;
  to: string | null;
  on_delete: string;
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function listTables(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid"
      )
      .all() as { name: string }[]
  ).map((t) => t.name);
}

function foreignKeysOf(db: DatabaseSync, table: string): ForeignKeyRow[][] {
  const rows = db
    .prepare("SELECT * FROM pragma_foreign_key_list(?)")
    .all(table) as unknown as ForeignKeyRow[];
  const foreignKeys = new Map<number, ForeignKeyRow[]>();
  for (const row of rows) {
    foreignKeys.set(row.id, [...(foreignKeys.get(row.id) ?? []), row]);
  }
  return [...foreignKeys.values()];
}

// La prod contient peut-être des lignes orphelines (qui pointent vers un
// compte ou un abonnement supprimé), héritées d'avant la mise en place des
// migrations, quand les clés étrangères n'étaient pas vérifiées. D1 les garde
// telles quelles mais les refuse à l'import. On les répare dans la base en
// mémoire comme l'aurait fait la suppression du parent : SET NULL si la clé
// est déclarée ON DELETE SET NULL, suppression de la ligne sinon.
function repairOrphans(db: DatabaseSync): void {
  for (const table of listTables(db)) {
    for (const columns of foreignKeysOf(db, table)) {
      const parent = columns[0].table;
      // `to` vaut NULL quand la clé vise la clé primaire du parent.
      const parentPrimaryKey = (
        db
          .prepare("SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk")
          .all(parent) as { name: string }[]
      ).map((c) => c.name);
      const parentColumns = columns.map((c, i) => c.to ?? parentPrimaryKey[i] ?? "rowid");
      const orphan =
        columns.map((c) => `${quoteIdent(c.from)} IS NOT NULL`).join(" AND ") +
        ` AND NOT EXISTS (SELECT 1 FROM ${quoteIdent(parent)} AS p WHERE ` +
        columns
          .map(
            (c, i) =>
              `p.${quoteIdent(parentColumns[i])} = ${quoteIdent(table)}.${quoteIdent(c.from)}`
          )
          .join(" AND ") +
        ")";
      const { count } = db
        .prepare(`SELECT count(*) AS count FROM ${quoteIdent(table)} WHERE ${orphan}`)
        .get() as { count: number };
      if (count === 0) {
        continue;
      }
      const setNull = columns[0].on_delete === "SET NULL";
      console.log(
        `  ${count} ligne(s) orpheline(s) dans ${table} (${columns.map((c) => c.from).join(", ")} → ${parent}) : ${setNull ? "clé mise à NULL" : "supprimée(s)"}`
      );
      db.exec(
        setNull
          ? `UPDATE ${quoteIdent(table)} SET ${columns.map((c) => `${quoteIdent(c.from)} = NULL`).join(", ")} WHERE ${orphan};`
          : `DELETE FROM ${quoteIdent(table)} WHERE ${orphan};`
      );
    }
  }
  const remaining = db.prepare("PRAGMA foreign_key_check").all();
  if (remaining.length > 0) {
    throw new Error(
      `Lignes orphelines impossibles à réparer : ${JSON.stringify(remaining.slice(0, 10))}`
    );
  }
}

// Tables triées pour que chaque table parente soit remplie avant les tables
// qui y font référence (ex. `users` avant `subscriptions`, `sessions`...).
function parentsFirst(db: DatabaseSync): string[] {
  const tables = listTables(db);
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visit = (table: string): void => {
    if (ordered.includes(table)) {
      return;
    }
    if (visiting.has(table)) {
      throw new Error(`Cycle de clés étrangères autour de la table '${table}'.`);
    }
    visiting.add(table);
    for (const columns of foreignKeysOf(db, table)) {
      if (columns[0].table !== table) {
        visit(columns[0].table);
      }
    }
    visiting.delete(table);
    ordered.push(table);
  };
  tables.forEach(visit);
  return ordered;
}

function sqlLiteral(value: unknown): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    // Colonne REAL : garder une valeur réelle (1.0, pas 1).
    if (!Number.isFinite(value)) {
      return value > 0 ? "9e999" : value < 0 ? "-9e999" : "NULL";
    }
    return Number.isInteger(value) ? value.toFixed(1) : String(value);
  }
  if (typeof value === "string") {
    // Une ligne par INSERT, comme l'export : retours à la ligne encodés.
    return `'${value
      .replaceAll("'", "''")
      .replaceAll("\r", "'||char(13)||'")
      .replaceAll("\n", "'||char(10)||'")}'`;
  }
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  throw new Error(`Valeur SQL inattendue : ${String(value)}`);
}

function insertStatements(db: DatabaseSync, table: string): string[] {
  const columns = (
    db.prepare("SELECT name FROM pragma_table_info(?) ORDER BY cid").all(table) as {
      name: string;
    }[]
  ).map((c) => c.name);
  const select = db.prepare(
    `SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)} ORDER BY rowid`
  );
  select.setReadBigInts(true);
  const header = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(",")}) VALUES(`;
  return select
    .all()
    .map((row) => header + columns.map((c) => sqlLiteral(row[c])).join(",") + ");");
}

function tableContent(db: DatabaseSync, table: string): string {
  const select = db.prepare(`SELECT * FROM ${quoteIdent(table)} ORDER BY rowid`);
  select.setReadBigInts(true);
  return JSON.stringify(select.all(), (_key, value: unknown) =>
    typeof value === "bigint"
      ? `${value}n`
      : value instanceof Uint8Array
        ? Buffer.from(value).toString("hex")
        : value
  );
}

// Construit le fichier d'import de la copie à partir de l'export de `bobine-notifications`.
//
// `wrangler d1 export` écrit chaque table suivie de ses données, dans l'ordre
// de création des tables : `subscriptions` (migration 0001) et ses lignes
// arrivent avant `users`, alors que sa colonne `user_id` y fait référence
// (migration 0008). Le `PRAGMA defer_foreign_keys` de l'export ne suffit pas
// sur D1 distant : l'import y vérifie les clés étrangères au fil de l'eau et
// annule tout ("FOREIGN KEY constraint failed" ou {"D1_RESET_DO":true}),
// alors qu'en local (miniflare) l'import passe.
//
// On rejoue donc l'export dans une base SQLite en mémoire, on y répare les
// éventuelles lignes orphelines, puis on écrit : le schéma, les données table
// par table en commençant par les tables parentes, et enfin sqlite_sequence.
// Le résultat est rejoué dans une seconde base en mémoire avec les clés
// étrangères vérifiées ligne par ligne et comparé à la source : si l'import
// devait échouer sur D1, il échoue ici avec un message lisible.
function buildImportSql(dump: string): string {
  const source = new DatabaseSync(":memory:");
  const check = new DatabaseSync(":memory:");
  try {
    // Chargé sans vérification (d'éventuelles lignes orphelines ne
    // passeraient pas), puis vérification activée pour que les réparations
    // déclenchent les mêmes ON DELETE CASCADE / SET NULL qu'en D1.
    source.exec("PRAGMA foreign_keys = OFF;");
    source.exec(dump);
    source.exec("PRAGMA foreign_keys = ON;");
    repairOrphans(source);

    // Schéma : tout ce qui n'est pas une donnée, dans l'ordre de l'export.
    // Chaque INSERT de l'export tient sur une ligne (retours à la ligne des
    // chaînes encodés avec char(10)).
    const schema = dump
      .split("\n")
      .filter(
        (line) => !line.startsWith("INSERT INTO ") && line !== "DELETE FROM sqlite_sequence;"
      );
    const data = parentsFirst(source).flatMap((table) => insertStatements(source, table));
    const hasSequence =
      source
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
        .get() !== undefined;
    // Remis à la fin : les INSERT ci-dessus font avancer les compteurs
    // AUTOINCREMENT, qu'on remplace par les valeurs de la prod.
    const sequence = hasSequence
      ? ["DELETE FROM sqlite_sequence;", ...insertStatements(source, "sqlite_sequence")]
      : [];
    const importSql = [...schema, ...data, ...sequence].join("\n") + "\n";

    check.exec("PRAGMA foreign_keys = ON;");
    check.exec(importSql.replace(/^PRAGMA defer_foreign_keys=TRUE;$/m, ""));
    for (const table of [...listTables(source), ...(hasSequence ? ["sqlite_sequence"] : [])]) {
      if (tableContent(check, table) !== tableContent(source, table)) {
        throw new Error(`La copie de la table '${table}' ne correspond pas à l'export.`);
      }
    }
    console.log(`  ${data.length} ligne(s) prêtes à importer.`);
    return importSql;
  } finally {
    source.close();
    check.close();
  }
}

function copyDatabase(): void {
  // L'export contient des données personnelles : il reste dans un dossier
  // temporaire du runner, supprimé dans tous les cas, jamais publié en
  // artefact.
  const workDir = mkdtempSync(join(tmpdir(), "seancy-copy-"));
  try {
    const dumpPath = join(workDir, "bobine.sql");
    console.log(`Export de '${SOURCE_DATABASE_NAME}'...`);
    wrangler(["d1", "export", SOURCE_DATABASE_NAME, "--remote", "--output", dumpPath]);

    console.log("Préparation de l'import (tables parentes d'abord)...");
    const importPath = join(workDir, "import.sql");
    writeFileSync(importPath, buildImportSql(readFileSync(dumpPath, "utf8")));

    console.log(`Import dans '${TARGET_DATABASE_NAME}'...`);
    wrangler(["d1", "execute", TARGET_DATABASE_NAME, "--remote", "--yes", "--file", importPath]);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Tâche planifiée
// ---------------------------------------------------------------------------

interface Schedule {
  cron: string;
}

async function cloudflare(path: string, init?: RequestInit): Promise<Response> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

// undefined : Worker introuvable (pas encore déployé, ou supprimé).
async function schedulesOf(worker: string): Promise<Schedule[] | undefined> {
  const response = await cloudflare(`/workers/scripts/${worker}/schedules`);
  if (response.status === 404) {
    return undefined;
  }
  const body = (await response.json()) as {
    success: boolean;
    errors?: unknown;
    result?: { schedules: Schedule[] };
  };
  if (!response.ok || !body.success || !body.result) {
    throw new Error(
      `Lecture des tâches planifiées de '${worker}' impossible (${response.status}) : ${JSON.stringify(body.errors)}`
    );
  }
  return body.result.schedules;
}

async function handOverSchedule(waitForNewWorker: boolean): Promise<void> {
  const oldSchedules = await schedulesOf(OLD_WORKER_NAME);
  if (!oldSchedules || oldSchedules.length === 0) {
    return;
  }
  const deadline = Date.now() + (waitForNewWorker ? MAX_WAIT_MINUTES * 60_000 : 0);
  let newSchedules = await schedulesOf(NEW_WORKER_NAME);
  while (!newSchedules?.length && Date.now() < deadline) {
    console.log(
      `Worker '${NEW_WORKER_NAME}' pas encore déployé, nouvel essai dans ${POLL_INTERVAL_SECONDS} s...`
    );
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_SECONDS * 1000));
    newSchedules = await schedulesOf(NEW_WORKER_NAME);
  }
  if (!newSchedules?.length) {
    console.log(
      `::warning::Le Worker '${NEW_WORKER_NAME}' n'a pas encore de tâche planifiée : celle de '${OLD_WORKER_NAME}' est gardée. Elle sera retirée au prochain push sur main, ou à la main (Worker ${OLD_WORKER_NAME} › Settings › Trigger events).`
    );
    return;
  }
  const response = await cloudflare(`/workers/scripts/${OLD_WORKER_NAME}/schedules`, {
    method: "PUT",
    body: "[]",
  });
  if (!response.ok) {
    throw new Error(
      `Impossible de retirer la tâche planifiée de '${OLD_WORKER_NAME}' (${response.status}) : ${await response.text()}`
    );
  }
  console.log(
    `Tâche planifiée retirée de '${OLD_WORKER_NAME}' : les notifications partent désormais de '${NEW_WORKER_NAME}' (${newSchedules.map((s) => s.cron).join(", ")}).`
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const tables = targetTables();
  let copied = false;
  if (tables.length === 0) {
    copyDatabase();
    copied = true;
    console.log(
      `Copie terminée : '${TARGET_DATABASE_NAME}' contient les données de '${SOURCE_DATABASE_NAME}'.`
    );
  } else if (!tables.includes("d1_migrations")) {
    throw new Error(
      `'${TARGET_DATABASE_NAME}' contient des tables (${tables.join(", ")}) mais pas d1_migrations : copie annulée pour ne rien écraser.`
    );
  } else {
    console.log(`'${TARGET_DATABASE_NAME}' est déjà initialisée : pas de copie.`);
  }
  // Un échec ici (droits du jeton, API indisponible) ne doit pas empêcher
  // l'application des migrations qui suit : simple avertissement.
  try {
    await handOverSchedule(copied);
  } catch (error) {
    console.log(
      `::warning::Tâche planifiée non transférée (${String(error)}). À faire à la main : Worker ${OLD_WORKER_NAME} › Settings › Trigger events.`
    );
  }
}

// Appelé directement par la CI ; importé par les tests locaux.
if (process.argv[1]?.endsWith("seancy-copy-d1.ts")) {
  await main();
}

export { buildImportSql };
