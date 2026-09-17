// Vérification de la logique pure du badge "Vient de sortir" / "Prochainement"
// pour un film suivi (src/core/api/movieReleaseBadge.ts) contre les règles
// attendues (voir commentaire en tête de ce module) :
//   - sortie initiale = date la plus ancienne, tous types publics confondus
//     (2 sortie limitée, 3 nationale, 4 numérique, 5 physique, 6 télévision),
//     pour la région cible — type 1 (avant-première) toujours écarté ;
//   - région cible absente : repli sur primaryReleaseDate ;
//   - "prochainement" dans les 30 jours avant la sortie initiale ;
//   - "vient de sortir" pendant les 14 jours après ;
//   - "vient de sortir" prioritaire en cas de chevauchement (sortie
//     aujourd'hui même) ;
//   - hors fenêtre ou aucune date exploitable -> null.
//
// Pas de framework de test dans ce repo (voir verify-upcoming-badge.ts) :
// même principe, fonctions importées directement depuis le module pur.

import { getMovieReleaseBadge } from "../src/core/api/movieReleaseBadge.ts";
import type { ReleaseDatesResponse } from "../src/core/types/tmdb.ts";

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

const TODAY = "2026-06-15";
const dateAt = (days: number): string => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const releaseDates = (
  entries: Array<{ region: string; type: number; date: string }>
): ReleaseDatesResponse => {
  const byRegion = new Map<string, Array<{ type: number; release_date: string }>>();
  for (const e of entries) {
    const list = byRegion.get(e.region) || [];
    list.push({ type: e.type, release_date: e.date });
    byRegion.set(e.region, list);
  }
  return {
    results: Array.from(byRegion.entries()).map(([iso_3166_1, release_dates]) => ({
      iso_3166_1,
      release_dates,
    })),
  };
};

function badge(
  response: ReleaseDatesResponse | undefined,
  region: string,
  primaryReleaseDate: string | null = null
) {
  return getMovieReleaseBadge(response, region, primaryReleaseDate, TODAY);
}

// --- Sortie initiale = date la plus ancienne, tous types confondus --------

check(
  "Sortie ciné (type 3) dans 29 jours -> prochainement",
  badge(releaseDates([{ region: "FR", type: 3, date: dateAt(29) }]), "FR"),
  { kind: "upcoming", label: "Prochainement", date: dateAt(29) }
);

check(
  "Sortie ciné dans 31 jours -> trop tôt, null",
  badge(releaseDates([{ region: "FR", type: 3, date: dateAt(31) }]), "FR"),
  null
);

check(
  "Sortie uniquement en vidéo (type 5, DTV), aucune sortie ciné/plateforme avant -> retenue comme sortie initiale",
  badge(releaseDates([{ region: "FR", type: 5, date: dateAt(-6) }]), "FR"),
  { kind: "just_released", label: "Vient de sortir", date: dateAt(-6) }
);

check(
  "Ciné hors fenêtre (31j) ET numérique plus tardif (60j) -> sortie initiale = la plus ancienne (ciné), toujours hors fenêtre -> null",
  badge(
    releaseDates([
      { region: "FR", type: 3, date: dateAt(31) },
      { region: "FR", type: 4, date: dateAt(60) },
    ]),
    "FR"
  ),
  null
);

check(
  "Numérique plus tôt (12j) que le ciné annoncé (40j) -> sortie initiale = numérique (la plus ancienne)",
  badge(
    releaseDates([
      { region: "FR", type: 3, date: dateAt(40) },
      { region: "FR", type: 4, date: dateAt(12) },
    ]),
    "FR"
  ),
  { kind: "upcoming", label: "Prochainement", date: dateAt(12) }
);

check(
  "Avant-première (type 1) ignorée : seule la sortie nationale (type 3) compte",
  badge(
    releaseDates([
      { region: "FR", type: 1, date: dateAt(-30) },
      { region: "FR", type: 3, date: dateAt(5) },
    ]),
    "FR"
  ),
  { kind: "upcoming", label: "Prochainement", date: dateAt(5) }
);

// --- Région cible absente : repli sur primaryReleaseDate -------------------

check(
  "Aucune entrée pour la région cible -> repli sur primaryReleaseDate",
  badge(releaseDates([{ region: "US", type: 3, date: dateAt(90) }]), "FR", dateAt(10)),
  { kind: "upcoming", label: "Prochainement", date: dateAt(10) }
);

check(
  "Aucune entrée du tout, aucun primaryReleaseDate -> null, pas de crash",
  badge(releaseDates([]), "FR", null),
  null
);

check(
  "Réponse release_dates absente (undefined) -> repli sur primaryReleaseDate",
  badge(undefined, "FR", dateAt(-3)),
  { kind: "just_released", label: "Vient de sortir", date: dateAt(-3) }
);

// --- Vient de sortir --------------------------------------------------------

check(
  "Sorti il y a 14 jours (limite incluse) -> vient de sortir",
  badge(releaseDates([{ region: "FR", type: 3, date: dateAt(-14) }]), "FR"),
  { kind: "just_released", label: "Vient de sortir", date: dateAt(-14) }
);

check(
  "Sorti il y a 15 jours -> trop tard, null",
  badge(releaseDates([{ region: "FR", type: 3, date: dateAt(-15) }]), "FR"),
  null
);

check(
  "Sorti aujourd'hui -> vient de sortir (pas prochainement)",
  badge(releaseDates([{ region: "FR", type: 3, date: dateAt(0) }]), "FR"),
  { kind: "just_released", label: "Vient de sortir", date: dateAt(0) }
);

console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
