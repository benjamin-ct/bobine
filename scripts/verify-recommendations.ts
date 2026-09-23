// Tests unitaires du moteur de recommandation PUR (worker/recommendationEngine.ts) :
// profil de goûts (genres/décennies), seuil d'exclusion, scoring, diversité,
// tirage pondéré.
//
// Pas de framework de test dans ce repo (aucun Jest/Vitest) : script
// autonome, exécutable avec `node scripts/verify-recommendations.ts`, sur le
// même modèle que verify-numeric-range-filter.ts. Les fonctions sont
// IMPORTÉES directement depuis recommendationEngine.ts (module pur, sans
// D1/TMDB/`fetch`, chargeable sous Node nu) : aucune copie à synchroniser.

import {
  buildTasteProfile,
  ratingToSignal,
  isColdStart,
  isGenreExcluded,
  scoreCandidateGenresAndDecade,
  popularityBonus,
  diversify,
  weightedPick,
  SIGNAL_WATCHED_NO_RATING,
  SIGNAL_WATCHLIST,
  type SignalItem,
} from "../worker/recommendationEngine.ts";

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

function checkTrue(name: string, actual: boolean): void {
  check(name, actual, true);
}

// --- ratingToSignal --------------------------------------------------------

check("Note 10/10 -> signal +1", ratingToSignal(10), 1);
check("Note 0/10 -> signal -1", ratingToSignal(0), -1);
check("Note 5/10 -> signal neutre", ratingToSignal(5), 0);
check("Note 7.5/10 -> signal positif modéré", ratingToSignal(7.5), 0.5);

// --- buildTasteProfile : affinité genre ------------------------------------

const ACTION = 28;
const COMEDY = 35;
const HORROR = 27;

function watched(genreIds: number[], rating: number, year: number | null = 2010): SignalItem {
  return { genreIds, year, signal: ratingToSignal(rating) };
}

{
  // Genre très bien noté à répétition -> score positif élevé.
  const items = [watched([ACTION], 9), watched([ACTION], 8), watched([ACTION], 10)];
  const profile = buildTasteProfile(items, []);
  checkTrue("Genre bien noté -> score positif", (profile.genreScores.get(ACTION)?.score || 0) > 0);
}

{
  // Un genre noté une seule fois très bas ne doit PAS être appris comme
  // exclu (minimum de données requis, voir EXCLUSION_MIN_NEGATIVE_COUNT).
  const items = [watched([HORROR], 1)];
  const profile = buildTasteProfile(items, []);
  check("Un seul rejet -> pas d'exclusion apprise", profile.learnedExcludedGenreIds, []);
}

{
  // 5 rejets et jamais un titre apprécié dans ce genre -> exclusion apprise.
  const items = [
    watched([HORROR], 1),
    watched([HORROR], 2),
    watched([HORROR], 1),
    watched([HORROR], 0),
    watched([HORROR], 2),
  ];
  const profile = buildTasteProfile(items, []);
  check("5 rejets sans jamais apprécier -> genre appris exclu", profile.learnedExcludedGenreIds, [
    HORROR,
  ]);
}

{
  // Même 5 rejets, mais un titre apprécié entre-temps -> pas d'exclusion.
  const items = [
    watched([HORROR], 1),
    watched([HORROR], 2),
    watched([HORROR], 8), // apprécié une fois
    watched([HORROR], 1),
    watched([HORROR], 0),
    watched([HORROR], 2),
  ];
  const profile = buildTasteProfile(items, []);
  check(
    "5 rejets + 1 titre apprécié -> pas d'exclusion apprise",
    profile.learnedExcludedGenreIds,
    []
  );
}

{
  // Genre explicitement exclu par l'utilisateur : n'entre même pas dans
  // l'apprentissage (score neutre, ni positif ni négatif appris).
  const items = [watched([COMEDY], 9)];
  const profile = buildTasteProfile(items, [COMEDY]);
  check(
    "Genre explicitement exclu -> absent des scores appris",
    profile.genreScores.has(COMEDY),
    false
  );
}

// --- Décennies + lissage -----------------------------------------------

{
  const items = [
    watched([ACTION], 9, 1985),
    watched([ACTION], 8, 1987),
    watched([ACTION], 9, 1995), // décennie voisine, doit tirer 1990 vers le haut
  ];
  const profile = buildTasteProfile(items, []);
  const score1980 = profile.decadeScores.get(1980)?.score || 0;
  const score1990 = profile.decadeScores.get(1990)?.score || 0;
  checkTrue("Décennie dominante (1980) -> score positif", score1980 > 0);
  checkTrue("Lissage : décennie voisine (1990) tirée vers le haut", score1990 > 0);
}

// --- Cold start --------------------------------------------------------

check(
  "Moins de 5 titres -> cold start",
  isColdStart(buildTasteProfile([watched([ACTION], 9)], [])),
  true
);
check(
  "5 titres ou plus -> pas de cold start",
  isColdStart(buildTasteProfile(Array(5).fill(watched([ACTION], 9)), [])),
  false
);

// --- isGenreExcluded -----------------------------------------------------

{
  const profile = buildTasteProfile(
    [
      watched([HORROR], 1),
      watched([HORROR], 2),
      watched([HORROR], 1),
      watched([HORROR], 0),
      watched([HORROR], 2),
    ],
    []
  );
  checkTrue(
    "Genre appris exclu détecté par isGenreExcluded",
    isGenreExcluded(profile, [], HORROR)
  );
  checkTrue(
    "Genre explicitement exclu détecté par isGenreExcluded",
    isGenreExcluded(profile, [COMEDY], COMEDY)
  );
  check("Genre neutre non exclu", isGenreExcluded(profile, [], ACTION), false);
}

// --- Score candidat + raison ----------------------------------------------

{
  const profile = buildTasteProfile([watched([ACTION], 9), watched([ACTION], 8)], []);
  const { affinityScore, reason } = scoreCandidateGenresAndDecade([ACTION, COMEDY], 2010, profile);
  checkTrue("Candidat dans un genre aimé -> score positif", affinityScore > 0);
  check("Raison retenue = le genre aimé", reason?.genreId, ACTION);
}

// --- Bonus de popularité ---------------------------------------------------

check("Peu de votes -> pas de bonus", popularityBonus(9, 5), 0);
checkTrue("Assez de votes + bonne note -> bonus positif", popularityBonus(9, 500) > 0);

// --- Diversité -------------------------------------------------------------

{
  const sorted = [
    { item: "a1", primaryGenreId: ACTION },
    { item: "a2", primaryGenreId: ACTION },
    { item: "a3", primaryGenreId: ACTION },
    { item: "c1", primaryGenreId: COMEDY },
  ];
  const result = diversify(sorted, 2);
  check("Diversité : au plus 2 du même genre à la suite", result, ["a1", "a2", "c1", "a3"]);
}

// --- Tirage pondéré ----------------------------------------------------

{
  // rng déterministe : toujours 0 -> tombe systématiquement sur le premier
  // item ayant un poids strictement positif dans l'ordre du tableau.
  const items = ["low", "high"];
  const weights: Record<string, number> = { low: 0.01, high: 10 };
  const pick = weightedPick(items, (item) => weights[item], () => 0);
  check("rng=0 -> premier item de la roulette", pick, "low");
}

{
  // rng proche de 1 doit retomber sur le dernier item à poids non nul.
  const items = ["low", "high"];
  const weights: Record<string, number> = { low: 0.01, high: 10 };
  const pick = weightedPick(items, (item) => weights[item], () => 0.999999);
  check("rng proche de 1 -> dernier item de la roulette", pick, "high");
}

check(
  "Constante SIGNAL_WATCHED_NO_RATING > 0 (léger positif)",
  SIGNAL_WATCHED_NO_RATING > 0,
  true
);
check(
  "Constante SIGNAL_WATCHLIST > SIGNAL_WATCHED_NO_RATING",
  SIGNAL_WATCHLIST > SIGNAL_WATCHED_NO_RATING,
  true
);

console.log(`\n${passed} test(s) réussi(s), ${failed} échoué(s).`);
if (failed > 0) {
  process.exit(1);
}
