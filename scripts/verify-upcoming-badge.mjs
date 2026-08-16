// Vérification des fonctions pures du badge dynamique "Prochainement"
// (getUpcomingMovieRelease / getUpcomingSeriesRelease, src/api/tmdb.js)
// contre les cas attendus (note TMDB prioritaire sur le type, repli
// "Cinéma"/"VOD numérique"/etc., networks[].name pour les séries, "Série
// à venir" par défaut, dates passées exclues...).
//
// Pas de framework de test dans ce repo (aucun Jest/Vitest) : ce script
// autonome, exécutable avec `node scripts/verify-upcoming-badge.mjs`,
// suit la même logique que les vérifications déjà faites cette session
// pour la logique serveur (worker/validate.js, worker/db.js).
//
// Les deux fonctions sont copiées ici verbatim depuis src/api/tmdb.js
// (import direct impossible sous Node nu : tmdb.js lit `import.meta.env.*`
// au chargement du module, une transformation propre à Vite qui n'existe
// pas en Node natif) — à garder synchronisé si la logique change côté
// tmdb.js.

const DEFAULT_REGION = "FR";

const RELEASE_TYPE_LABELS = {
  2: "Cinéma",
  3: "Cinéma",
  4: "VOD numérique",
  5: "DVD / Blu-ray",
  6: "Télévision",
};

function isStrictlyFutureDate(dateString, todayIso) {
  if (!dateString) return false;
  return dateString.slice(0, 10) > todayIso;
}

function getUpcomingMovieRelease(releaseDatesResponse, region = DEFAULT_REGION) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const entry = releaseDatesResponse?.results?.find((r) => r.iso_3166_1 === region);
  const future = (entry?.release_dates || [])
    .filter((rd) => isStrictlyFutureDate(rd.release_date, todayIso))
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  const next = future[0];
  if (!next) return null;
  const label = next.note?.trim() || RELEASE_TYPE_LABELS[next.type] || null;
  if (!label) return null;
  return { label, date: next.release_date.slice(0, 10) };
}

function getUpcomingSeriesRelease(details) {
  const label = details?.networks?.find((n) => n?.name)?.name || "Série à venir";
  const date = details?.first_air_date || null;
  return { label, date };
}

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) {
    console.log(`     attendu: ${JSON.stringify(expected)}`);
    console.log(`     obtenu : ${JSON.stringify(actual)}`);
  }
  ok ? passed++ : failed++;
}

const future = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};
const past = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

// --- Films -----------------------------------------------------------

check(
  "Film : note='Prime Video', type=2, date future -> badge Prime Video",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Prime Video", release_date: future(10), type: 2 }] }] },
    "FR"
  )?.label,
  "Prime Video"
);

check(
  "Film : note='', type=3, date future -> badge Cinéma",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(15), type: 3 }] }] },
    "FR"
  )?.label,
  "Cinéma"
);
check(
  "Film : note='', type=2, date future -> badge Cinéma (limitée = Cinéma aussi)",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(5), type: 2 }] }] },
    "FR"
  )?.label,
  "Cinéma"
);

check(
  "Film : note='', type=4, date future -> badge VOD numérique",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(20), type: 4 }] }] },
    "FR"
  )?.label,
  "VOD numérique"
);

check(
  "Film : note='Netflix', type=4, date future -> badge Netflix",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Netflix", release_date: future(8), type: 4 }] }] },
    "FR"
  )?.label,
  "Netflix"
);

check(
  "Film : plusieurs dates futures -> la plus proche est utilisée",
  getUpcomingMovieRelease(
    {
      results: [
        {
          iso_3166_1: "FR",
          release_dates: [
            { note: "DVD", release_date: future(60), type: 5 },
            { note: "Cinéma FR", release_date: future(5), type: 3 },
          ],
        },
      ],
    },
    "FR"
  ),
  { label: "Cinéma FR", date: future(5).slice(0, 10) }
);

check(
  "Film : uniquement une date passée -> aucune sortie future (null)",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Netflix", release_date: past(5), type: 4 }] }] },
    "FR"
  ),
  null
);

check(
  "Film : aucune entrée pour la région -> null",
  getUpcomingMovieRelease({ results: [{ iso_3166_1: "US", release_dates: [{ note: "", release_date: future(5), type: 3 }] }] }, "FR"),
  null
);

// --- Séries ------------------------------------------------------------

check(
  "Série : networks=[Disney+] -> badge Disney+",
  getUpcomingSeriesRelease({ first_air_date: "2026-10-14", networks: [{ name: "Disney+" }] }),
  { label: "Disney+", date: "2026-10-14" }
);

check(
  "Série : networks=[ABC] -> badge ABC (diffuseur, pas 'plateforme')",
  getUpcomingSeriesRelease({ first_air_date: "2026-11-02", networks: [{ name: "ABC" }] }),
  { label: "ABC", date: "2026-11-02" }
);

check(
  "Série : aucun network -> badge 'Série à venir'",
  getUpcomingSeriesRelease({ first_air_date: "2026-09-01", networks: [] }),
  { label: "Série à venir", date: "2026-09-01" }
);
check(
  "Série : networks absent (undefined) -> badge 'Série à venir', pas de crash",
  getUpcomingSeriesRelease({ first_air_date: "2026-09-01" }),
  { label: "Série à venir", date: "2026-09-01" }
);

check(
  "Série : BBC (chaîne classique) -> badge BBC, sans distinction avec une plateforme",
  getUpcomingSeriesRelease({ first_air_date: "2026-12-01", networks: [{ name: "BBC" }] }),
  { label: "BBC", date: "2026-12-01" }
);

console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
