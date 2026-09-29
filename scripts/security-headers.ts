// Génère public/_headers à partir de worker/security-headers.ts (source
// unique des en-têtes de sécurité, voir ce fichier).
//
//   node scripts/security-headers.ts          réécrit public/_headers
//   node scripts/security-headers.ts --check  échoue si le fichier diffère (CI)

import { readFileSync, writeFileSync } from "node:fs";
import { renderHeadersFile } from "../worker/security-headers.ts";

const path = new URL("../public/_headers", import.meta.url);
const expected = renderHeadersFile();

if (process.argv.includes("--check")) {
  const actual = readFileSync(path, "utf8");
  if (actual !== expected) {
    console.error(
      "FAIL public/_headers n'est plus aligné sur worker/security-headers.ts : lancer `npm run headers:generate`."
    );
    process.exit(1);
  }
  console.log("OK   public/_headers aligné sur worker/security-headers.ts");
} else {
  writeFileSync(path, expected);
  console.log("public/_headers régénéré");
}
