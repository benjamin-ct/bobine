// Vérification des fonctions pures du badge dynamique "Prochainement"
// (getUpcomingMovieRelease / getUpcomingSeriesRelease, src/api/tmdb.js)
// contre les cas attendus :
//   - région cible trouvée : type le plus prioritaire (3 > 4 > 2 > 6 > 5)
//     parmi les sorties futures, date la plus proche dans ce type, tirée
//     de /release_dates ;
//   - région cible absente : repli sur item.release_date (jamais la date
//     d'un autre pays), seulement si cette date est future ; type le plus
//     prioritaire toutes régions confondues ; note utilisée uniquement
//     pour le type 4 et seulement si elle appartient à ce type retenu ;
//   - type 1 (avant-première) toujours écarté des sorties "grand public" ;
//   - networks[].name pour les séries, "Série à venir" par défaut ;
//   - dates passées exclues.
//
// Pas de framework de test dans ce repo (aucun Jest/Vitest) : ce script
// autonome, exécutable avec `node scripts/verify-upcoming-badge.mjs`,
// suit la même logique que les vérifications déjà faites cette session
// pour la logique serveur (worker/validate.js, worker/db.js).
//
// Les fonctions sont copiées ici verbatim depuis src/api/tmdb.js (import
// direct impossible sous Node nu : tmdb.js lit `import.meta.env.*` au
// chargement du module, une transformation propre à Vite qui n'existe pas
// en Node natif) — à garder synchronisé si la logique change côté tmdb.js.

const DEFAULT_REGION = "FR";

function isStrictlyFutureDate(dateString, todayIso) {
  if (!dateString) return false;
  return dateString.slice(0, 10) > todayIso;
}

function futureReleases(releaseDates, todayIso) {
  return (releaseDates || []).filter((rd) => isStrictlyFutureDate(rd.release_date, todayIso));
}

const RELEASE_TYPE_PRIORITY = [3, 4, 2, 6, 5];

function labelForRelease(type, note) {
  if (type === 2 || type === 3) return "Cinéma";
  if (type === 4) return note?.trim() || "Sortie numérique";
  if (type === 5) return "Sortie physique";
  if (type === 6) return "Télévision";
  return null;
}

function pickReleaseByTypePriority(releaseDates, todayIso) {
  const candidates = futureReleases(releaseDates, todayIso).filter((rd) => rd.type !== 1);
  for (const type of RELEASE_TYPE_PRIORITY) {
    const ofType = candidates.filter((rd) => rd.type === type);
    if (ofType.length > 0) {
      return { type, entries: ofType.sort((a, b) => a.release_date.localeCompare(b.release_date)) };
    }
  }
  return null;
}

function getUpcomingMovieRelease(releaseDatesResponse, region = DEFAULT_REGION, primaryReleaseDate = null) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const results = releaseDatesResponse?.results || [];
  const regionEntry = results.find((r) => r.iso_3166_1 === region);

  if (regionEntry) {
    const picked = pickReleaseByTypePriority(regionEntry.release_dates, todayIso);
    if (!picked) return null;
    const next = picked.entries[0];
    const label = labelForRelease(picked.type, next.note);
    return label ? { label, date: next.release_date.slice(0, 10) } : null;
  }

  if (!isStrictlyFutureDate(primaryReleaseDate, todayIso)) return null;

  const allReleaseDates = results.flatMap((r) => r.release_dates || []);
  const picked = pickReleaseByTypePriority(allReleaseDates, todayIso);
  if (!picked) return null;
  const noteForType = picked.entries.find((rd) => rd.note?.trim())?.note;
  const label = labelForRelease(picked.type, noteForType);
  return label ? { label, date: primaryReleaseDate.slice(0, 10) } : null;
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
const futureDateOnly = (days) => future(days).slice(0, 10);
const past = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

// --- Films : région cible trouvée (étapes 1-2) --------------------------

check(
  "Film région trouvée : type 4 avec note -> note utilisée comme badge",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Prime Video", release_date: future(10), type: 4 }] }] },
    "FR"
  )?.label,
  "Prime Video"
);

check(
  "Film région trouvée : type 3 -> Cinéma (note ignorée pour ce type)",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Une note quelconque", release_date: future(15), type: 3 }] }] },
    "FR"
  )?.label,
  "Cinéma"
);

check(
  "Film région trouvée : type 4 sans note -> Sortie numérique",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(20), type: 4 }] }] },
    "FR"
  )?.label,
  "Sortie numérique"
);

check(
  "Film région trouvée : type 5 -> Sortie physique",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(30), type: 5 }] }] },
    "FR"
  )?.label,
  "Sortie physique"
);

check(
  "Film région trouvée : type 6 -> Télévision",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(30), type: 6 }] }] },
    "FR"
  )?.label,
  "Télévision"
);

check(
  "Film région trouvée : type 2 -> Cinéma",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(5), type: 2 }] }] },
    "FR"
  )?.label,
  "Cinéma"
);

check(
  "Film région trouvée : type 3 ET type 4 tous deux futurs -> priorité au type 3 (Cinéma), même si type 4 est plus proche",
  getUpcomingMovieRelease(
    {
      results: [
        {
          iso_3166_1: "FR",
          release_dates: [
            { note: "Netflix", release_date: future(5), type: 4 },
            { note: "", release_date: future(30), type: 3 },
          ],
        },
      ],
    },
    "FR"
  ),
  { label: "Cinéma", date: futureDateOnly(30) }
);

check(
  "Film région trouvée : plusieurs dates du même type retenu -> la plus proche est utilisée, tirée de release_dates",
  getUpcomingMovieRelease(
    {
      results: [
        {
          iso_3166_1: "FR",
          release_dates: [
            { note: "", release_date: future(60), type: 3 },
            { note: "", release_date: future(20), type: 3 },
          ],
        },
      ],
    },
    "FR"
  ),
  { label: "Cinéma", date: futureDateOnly(20) }
);

check(
  "Film région trouvée : uniquement une date passée -> null",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Netflix", release_date: past(5), type: 4 }] }] },
    "FR"
  ),
  null
);

check(
  "Film région trouvée : avant-première (type 1) future + sortie cinéma (type 3) future -> la sortie cinéma l'emporte",
  getUpcomingMovieRelease(
    {
      results: [
        {
          iso_3166_1: "FR",
          release_dates: [
            { note: "", release_date: future(3), type: 1 },
            { note: "", release_date: future(20), type: 3 },
          ],
        },
      ],
    },
    "FR"
  ),
  { label: "Cinéma", date: futureDateOnly(20) }
);

check(
  "Film région trouvée : uniquement une avant-première (type 1) future -> toujours écartée, aucun badge (null)",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(3), type: 1 }] }] },
    "FR"
  ),
  null
);

// --- Films : région cible absente (étape 3) ------------------------------

check(
  "Film région absente : primaryReleaseDate future, type 3 majoritairement présent -> Cinéma, date = primaryReleaseDate (pas celle d'un pays)",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "", release_date: future(10), type: 3 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(12), type: 3 }] },
      ],
    },
    "FR",
    futureDateOnly(25)
  ),
  { label: "Cinéma", date: futureDateOnly(25) }
);

check(
  "Film région absente : type 3 (US) et type 4 (DE) tous deux présents -> priorité au type 3 malgré une date US plus lointaine",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "", release_date: future(40), type: 3 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "Netflix", release_date: future(5), type: 4 }] },
      ],
    },
    "FR",
    futureDateOnly(25)
  )?.label,
  "Cinéma"
);

check(
  "Film région absente : type 4 retenu (aucun type 3 nulle part), note présente sur ce type -> note utilisée",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "Netflix", release_date: future(10), type: 4 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(12), type: 4 }] },
      ],
    },
    "FR",
    futureDateOnly(25)
  ),
  { label: "Netflix", date: futureDateOnly(25) }
);

check(
  "Film région absente : note présente mais sur un type non retenu (priorité) -> ignorée",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "Netflix", release_date: future(10), type: 4 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(12), type: 3 }] },
      ],
    },
    "FR",
    futureDateOnly(25)
  )?.label,
  "Cinéma"
);

check(
  "Film région absente : avant-premières (type 1) partout -> toujours écartées, null même si des dates existent",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "", release_date: future(2), type: 1 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(5), type: 1 }] },
      ],
    },
    "FR",
    futureDateOnly(25)
  ),
  null
);

check(
  "Film région absente : primaryReleaseDate PASSÉE -> film non retenu, null même si des sorties futures existent ailleurs",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "US", release_dates: [{ note: "", release_date: future(10), type: 3 }] }] },
    "FR",
    past(3)
  ),
  null
);

check(
  "Film région absente : primaryReleaseDate absente (null) -> non retenu, null",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "US", release_dates: [{ note: "", release_date: future(10), type: 3 }] }] },
    "FR",
    null
  ),
  null
);

check(
  "Film région absente : aucune sortie future nulle part -> null",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "US", release_dates: [{ note: "", release_date: past(5), type: 3 }] }] },
    "FR",
    futureDateOnly(10)
  ),
  null
);

check(
  "Film : aucun résultat du tout -> null, pas de crash",
  getUpcomingMovieRelease({ results: [] }, "FR", futureDateOnly(10)),
  null
);

// --- Séries (inchangé) ---------------------------------------------------

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
