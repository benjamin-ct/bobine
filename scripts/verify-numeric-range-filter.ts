// Tests unitaires des utilitaires PURS de bornage/validation des filtres
// numériques min/max (src/shared/lib/numericRangeFilter.ts) : clamp d'une
// valeur saisie, détection de plage inversée (min > max).
//
// Pas de framework de test dans ce repo (aucun Jest/Vitest) : script
// autonome, exécutable avec `node scripts/verify-numeric-range-filter.ts`
// (Node exécute le TypeScript nativement, sans étape de build), sur le
// même modèle que verify-movie-meta.ts. Les fonctions sont IMPORTÉES
// directement depuis numericRangeFilter.ts (module pur, sans
// `import.meta.env` ni réseau, chargeable sous Node nu) : aucune copie à
// synchroniser.

import { clampNumericValue, isRangeInverted } from "../src/shared/lib/numericRangeFilter.ts";

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

// --- clampNumericValue ----------------------------------------------------

check("Valeur vide -> inchangée", clampNumericValue("", 0, 10), "");
check("Valeur dans les bornes -> inchangée", clampNumericValue("7", 0, 10), "7");
check("Note 15 plafonnée à 10 (bug du ticket)", clampNumericValue("15", 0, 10), "10");
check("Valeur sous le minimum -> ramenée au minimum", clampNumericValue("-3", 0, 10), "0");
check("Pas de max fourni -> pas de plafond", clampNumericValue("99999", 0), "99999");
check("Non numérique -> inchangée (pas de crash)", clampNumericValue("abc", 0, 10), "abc");
check("Décimales préservées si dans les bornes", clampNumericValue("7.5", 0, 10), "7.5");

// --- isRangeInverted -------------------------------------------------------

check(
  "Année min 3000 > max 1800 -> inversée (bug du ticket)",
  isRangeInverted("3000", "1800"),
  true
);
check("Min <= max -> non inversée", isRangeInverted("2000", "2020"), false);
check("Min === max -> non inversée", isRangeInverted("5", "5"), false);
check("Min vide -> non inversée (rien à comparer)", isRangeInverted("", "10"), false);
check("Max vide -> non inversée (rien à comparer)", isRangeInverted("10", ""), false);
check("Valeur non numérique -> non inversée (pas de crash)", isRangeInverted("abc", "10"), false);

console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
