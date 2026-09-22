// Tests unitaires du limiteur en mémoire (worker/rate-limit.ts,
// `checkRateLimitInMemory`) introduit pour le ticket Trello "Milliers de
// calls workers" : le proxy TMDB doit rester plafonné sans plus écrire dans
// D1 à chaque requête (l'écriture D1 systématique de `checkRateLimit` a fini
// par épuiser le quota d'écritures du plan gratuit sous le trafic d'un
// crawler distribué).
//
// Pas de framework de test dans ce repo (aucun Jest/Vitest) : script
// autonome, exécutable avec `node scripts/verify-rate-limit-memory.ts`, sur
// le même modèle que les autres scripts verify:*.

import { checkRateLimitInMemory } from "../worker/rate-limit.ts";

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

{
  const key = `test:sous-limite:${Math.random()}`;
  const results = Array.from({ length: 5 }, () =>
    checkRateLimitInMemory(key, { limit: 5, windowMs: 60_000 }, 0)
  );
  check("5 appels sous une limite de 5 -> tous acceptés", results, [true, true, true, true, true]);
}

{
  const key = `test:depassement:${Math.random()}`;
  const results = Array.from({ length: 7 }, () =>
    checkRateLimitInMemory(key, { limit: 5, windowMs: 60_000 }, 0)
  );
  check("7 appels sur une limite de 5 -> les 2 derniers refusés", results, [
    true,
    true,
    true,
    true,
    true,
    false,
    false,
  ]);
}

{
  const key = `test:nouvelle-fenetre:${Math.random()}`;
  const windowMs = 60_000;
  for (let i = 0; i < 5; i++) checkRateLimitInMemory(key, { limit: 5, windowMs }, 0);
  const refusedEncoreDansLaFenetre = checkRateLimitInMemory(key, { limit: 5, windowMs }, 1_000);
  const accepteNouvelleFenetre = checkRateLimitInMemory(key, { limit: 5, windowMs }, windowMs);
  check("refusé juste avant la fin de fenêtre", refusedEncoreDansLaFenetre, false);
  check("de nouveau accepté dans la fenêtre suivante", accepteNouvelleFenetre, true);
}

{
  const keyA = `test:cles-independantes:a:${Math.random()}`;
  const keyB = `test:cles-independantes:b:${Math.random()}`;
  for (let i = 0; i < 5; i++) checkRateLimitInMemory(keyA, { limit: 5, windowMs: 60_000 }, 0);
  check(
    "une clé distincte n'est pas affectée par le plafond atteint sur une autre",
    checkRateLimitInMemory(keyB, { limit: 5, windowMs: 60_000 }, 0),
    true
  );
}

console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
