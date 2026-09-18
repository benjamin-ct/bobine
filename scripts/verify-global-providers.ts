// Vérification de la logique pure de fusion plateformes globales +
// régionales (src/core/api/globalProviders.ts).
//
// Pas de framework de test dans ce repo : script autonome, sur le même
// modèle que verify-upcoming-badge.ts.

import { GLOBAL_PROVIDER_IDS, withGlobalProviders } from "../src/core/api/globalProviders.ts";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) {
    console.log(`     attendu: ${JSON.stringify(expected)}`);
    console.log(`     obtenu : ${JSON.stringify(actual)}`);
  }
  ok ? passed++ : failed++;
}

check(
  "Région sans aucune plateforme globale -> toutes ajoutées à la suite",
  withGlobalProviders([{ id: 381, name: "Canal+" }]),
  [
    { id: 381, name: "Canal+" },
    { id: 8, name: "Netflix" },
    { id: 119, name: "Amazon Prime Video" },
    { id: 337, name: "Disney Plus" },
    { id: 350, name: "Apple TV" },
  ]
);

check(
  "Région avec déjà toutes les globales -> aucun doublon, ordre régional préservé",
  withGlobalProviders([
    { id: 350, name: "Apple TV" },
    { id: 8, name: "Netflix" },
    { id: 119, name: "Amazon Prime Video" },
    { id: 337, name: "Disney+" },
  ]),
  [
    { id: 350, name: "Apple TV" },
    { id: 8, name: "Netflix" },
    { id: 119, name: "Amazon Prime Video" },
    { id: 337, name: "Disney+" },
  ]
);

check(
  "Région avec certaines globales déjà présentes -> seules les manquantes sont ajoutées",
  withGlobalProviders([
    { id: 8, name: "Netflix" },
    { id: 381, name: "Canal+" },
  ]),
  [
    { id: 8, name: "Netflix" },
    { id: 381, name: "Canal+" },
    { id: 119, name: "Amazon Prime Video" },
    { id: 337, name: "Disney Plus" },
    { id: 350, name: "Apple TV" },
  ]
);

check("Liste régionale vide -> uniquement les globales", withGlobalProviders([]), [
  { id: 8, name: "Netflix" },
  { id: 119, name: "Amazon Prime Video" },
  { id: 337, name: "Disney Plus" },
  { id: 350, name: "Apple TV" },
]);

check("4 plateformes globales définies", GLOBAL_PROVIDER_IDS.size, 4);

console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
