// Vérification des fonctions pures du badge dynamique "Prochainement"
// (getUpcomingMovieRelease / getUpcomingSeriesRelease, src/api/tmdb.js)
// contre les cas attendus (note TMDB prioritaire sur le type quand la
// région cible est connue, repli sur le type majoritaire sinon,
// avant-premières écartées si autre chose existe, networks[].name pour
// les séries, "Série à venir" par défaut, dates passées exclues...).
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

const RELEASE_TYPE_LABELS = {
  1: "Cinéma",
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

function futureReleases(releaseDates, todayIso) {
  return (releaseDates || []).filter((rd) => isStrictlyFutureDate(rd.release_date, todayIso));
}

function excludePremiereUnlessOnlyOption(releaseDates) {
  const nonPremiere = releaseDates.filter((rd) => rd.type !== 1);
  return nonPremiere.length > 0 ? nonPremiere : releaseDates;
}

function getUpcomingMovieRelease(releaseDatesResponse, region = DEFAULT_REGION) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const results = releaseDatesResponse?.results || [];
  const regionEntry = results.find((r) => r.iso_3166_1 === region);

  if (regionEntry) {
    const candidates = excludePremiereUnlessOnlyOption(futureReleases(regionEntry.release_dates, todayIso)).sort(
      (a, b) => a.release_date.localeCompare(b.release_date)
    );
    const next = candidates[0];
    if (!next) return null;
    const label = next.note?.trim() || RELEASE_TYPE_LABELS[next.type] || null;
    return label ? { label, date: next.release_date.slice(0, 10) } : null;
  }

  const allFuture = results.flatMap((r) => futureReleases(r.release_dates, todayIso));
  const candidates = excludePremiereUnlessOnlyOption(allFuture);
  if (candidates.length === 0) return null;

  const countByType = new Map();
  for (const rd of candidates) countByType.set(rd.type, (countByType.get(rd.type) || 0) + 1);
  let majorityType = null;
  let majorityCount = -1;
  for (const [type, count] of countByType) {
    if (count > majorityCount) {
      majorityType = type;
      majorityCount = count;
    }
  }

  const majorityEntries = candidates
    .filter((rd) => rd.type === majorityType)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  const noteForMajorityType = majorityEntries.find((rd) => rd.note?.trim())?.note?.trim();
  const label = noteForMajorityType || RELEASE_TYPE_LABELS[majorityType] || null;
  return label ? { label, date: majorityEntries[0].release_date.slice(0, 10) } : null;
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

// --- Films : région cible trouvée (étapes 1-2) --------------------------

check(
  "Film région trouvée : note='Prime Video', type=2, date future -> badge Prime Video",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Prime Video", release_date: future(10), type: 2 }] }] },
    "FR"
  )?.label,
  "Prime Video"
);

check(
  "Film région trouvée : note='', type=3, date future -> badge Cinéma",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(15), type: 3 }] }] },
    "FR"
  )?.label,
  "Cinéma"
);
check(
  "Film région trouvée : note='', type=2, date future -> badge Cinéma (limitée = Cinéma aussi)",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(5), type: 2 }] }] },
    "FR"
  )?.label,
  "Cinéma"
);

check(
  "Film région trouvée : note='', type=4, date future -> badge VOD numérique",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(20), type: 4 }] }] },
    "FR"
  )?.label,
  "VOD numérique"
);

check(
  "Film région trouvée : note='Netflix', type=4, date future -> badge Netflix",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Netflix", release_date: future(8), type: 4 }] }] },
    "FR"
  )?.label,
  "Netflix"
);

check(
  "Film région trouvée : plusieurs dates futures -> la plus proche est utilisée",
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
  "Film région trouvée : uniquement une date passée -> aucune sortie future (null)",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "Netflix", release_date: past(5), type: 4 }] }] },
    "FR"
  ),
  null
);

check(
  "Film région trouvée : avant-première (type 1) future + sortie cinéma (type 3) future -> la sortie cinéma l'emporte (type 1 écarté)",
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
  { label: "Cinéma", date: future(20).slice(0, 10) }
);

check(
  "Film région trouvée : uniquement une avant-première (type 1) future -> gardée faute d'alternative (règle 4)",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "FR", release_dates: [{ note: "", release_date: future(3), type: 1 }] }] },
    "FR"
  ),
  { label: "Cinéma", date: future(3).slice(0, 10) }
);

// --- Films : région cible absente (étape 3, majorité de type) -----------

check(
  "Film région absente : 2 pays en type 3, 1 en type 4 -> type majoritaire 3 (Cinéma)",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "", release_date: future(10), type: 3 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(12), type: 3 }] },
        { iso_3166_1: "GB", release_dates: [{ note: "", release_date: future(8), type: 4 }] },
      ],
    },
    "FR"
  ),
  { label: "Cinéma", date: future(10).slice(0, 10) }
);

check(
  "Film région absente : note présente sur le type majoritaire -> note utilisée",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "Netflix", release_date: future(10), type: 4 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(12), type: 4 }] },
        { iso_3166_1: "GB", release_dates: [{ note: "", release_date: future(8), type: 3 }] },
      ],
    },
    "FR"
  ),
  { label: "Netflix", date: future(10).slice(0, 10) }
);

check(
  "Film région absente : note présente mais sur un type MINORITAIRE -> ignorée, libellé du type majoritaire utilisé",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "Netflix", release_date: future(10), type: 4 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(12), type: 3 }] },
        { iso_3166_1: "GB", release_dates: [{ note: "", release_date: future(8), type: 3 }] },
      ],
    },
    "FR"
  ),
  { label: "Cinéma", date: future(8).slice(0, 10) }
);

check(
  "Film région absente : avant-premières (type 1) + sorties cinéma (type 3) -> type 1 écarté du vote majoritaire",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "", release_date: future(2), type: 1 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(2), type: 1 }] },
        { iso_3166_1: "GB", release_dates: [{ note: "", release_date: future(15), type: 3 }] },
      ],
    },
    "FR"
  ),
  { label: "Cinéma", date: future(15).slice(0, 10) }
);

check(
  "Film région absente : uniquement des avant-premières (type 1) -> gardées faute d'alternative (règle 4)",
  getUpcomingMovieRelease(
    {
      results: [
        { iso_3166_1: "US", release_dates: [{ note: "", release_date: future(2), type: 1 }] },
        { iso_3166_1: "DE", release_dates: [{ note: "", release_date: future(5), type: 1 }] },
      ],
    },
    "FR"
  ),
  { label: "Cinéma", date: future(2).slice(0, 10) }
);

check(
  "Film région absente : aucune sortie future nulle part -> null",
  getUpcomingMovieRelease(
    { results: [{ iso_3166_1: "US", release_dates: [{ note: "", release_date: past(5), type: 3 }] }] },
    "FR"
  ),
  null
);

check(
  "Film : aucun résultat du tout -> null, pas de crash",
  getUpcomingMovieRelease({ results: [] }, "FR"),
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
