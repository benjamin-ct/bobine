// Budget de taille du JavaScript chargé au premier affichage (audit H6).
// Mesure, après `npm run build`, les scripts référencés par dist/index.html
// (point d'entrée + modulepreload), compressés en gzip comme sur le réseau.
// Les pages chargées à la demande (React.lazy), Sentry et les langues autres
// que le français n'en font pas partie.
//
//   node scripts/check-bundle-size.ts

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Environ 153 Ko à la mise en place (contre 241 Ko avant le découpage) :
// marge pour les évolutions normales, mais un import statique d'une grosse
// dépendance ou d'une page entière fera échouer la CI.
const BUDGET_KB = 185;

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");
const scripts = [...new Set(html.match(/\/assets\/[^"]+\.js/g) ?? [])];
if (scripts.length === 0) {
  console.error("FAIL aucun script trouvé dans dist/index.html : lancer `npm run build` d'abord.");
  process.exit(1);
}

let totalBytes = 0;
for (const script of scripts) {
  const bytes = gzipSync(readFileSync(new URL(`.${script}`, dist))).length;
  totalBytes += bytes;
  console.log(`     ${(bytes / 1024).toFixed(1).padStart(6)} Ko  ${script}`);
}
const totalKb = totalBytes / 1024;
if (totalKb > BUDGET_KB) {
  console.error(
    `FAIL JavaScript initial : ${totalKb.toFixed(1)} Ko gzip, au-delà du budget de ${BUDGET_KB} Ko.`
  );
  process.exit(1);
}
console.log(`OK   JavaScript initial : ${totalKb.toFixed(1)} Ko gzip (budget ${BUDGET_KB} Ko)`);
