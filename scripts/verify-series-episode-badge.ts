// Vérification de la logique pure du badge "Vient de sortir" / "Prochainement"
// sur les épisodes de séries (src/core/api/seriesEpisodeBadge.ts) contre les
// règles de seuil attendues (voir commentaire en tête de ce module) :
//   - nouvelle série pas sortie -> "prochainement" dans les 30 jours avant
//   - nouvelle saison (série déjà sortie) -> "prochainement" dans les 14 jours avant
//   - saison en cours -> "prochainement" dans les 7 jours avant
//   - nouvelle série qui vient de sortir (S1E1) -> "vient de sortir" pendant 14 jours
//   - nouvelle saison/nouvel épisode qui vient de sortir -> "vient de sortir" pendant 7 jours
//   - "vient de sortir" prioritaire sur "prochainement" en cas de chevauchement
//   - hors fenêtre (trop tôt/trop tard) ou aucune donnée -> null
//
// Pas de framework de test dans ce repo (voir verify-upcoming-badge.ts) :
// même principe, fonctions importées directement depuis le module pur.

import { getSeriesEpisodeBadge } from "../src/core/api/seriesEpisodeBadge.ts";

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

// --- Prochainement --------------------------------------------------------

check(
  "Nouvelle série pas sortie, S1E1 dans 29 jours -> prochainement",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: null,
      next_episode_to_air: { air_date: dateAt(29), episode_number: 1, season_number: 1 },
    },
    TODAY
  ),
  { kind: "upcoming", label: "Prochainement", date: dateAt(29) }
);

check(
  "Nouvelle série pas sortie, S1E1 dans 31 jours -> trop tôt, null",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: null,
      next_episode_to_air: { air_date: dateAt(31), episode_number: 1, season_number: 1 },
    },
    TODAY
  ),
  null
);

check(
  "Nouvelle série jamais diffusée, next_episode_to_air pas encore renseigné par TMDB, first_air_date dans 2 jours -> prochainement (repli)",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: null,
      next_episode_to_air: null,
      first_air_date: dateAt(2),
    },
    TODAY
  ),
  { kind: "upcoming", label: "Prochainement", date: dateAt(2) }
);

check(
  "Nouvelle série jamais diffusée, ni next_episode_to_air ni first_air_date exploitable dans la fenêtre -> null",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: null,
      next_episode_to_air: null,
      first_air_date: dateAt(45),
    },
    TODAY
  ),
  null
);

check(
  "next_episode_to_air déjà renseigné : first_air_date ignoré (pas de double calcul)",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: null,
      next_episode_to_air: { air_date: dateAt(35), episode_number: 1, season_number: 1 },
      first_air_date: dateAt(2),
    },
    TODAY
  ),
  null
);

check(
  "Série déjà sortie, nouvelle saison (S2E1) dans 13 jours -> prochainement",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-200), episode_number: 8, season_number: 1 },
      next_episode_to_air: { air_date: dateAt(13), episode_number: 1, season_number: 2 },
    },
    TODAY
  ),
  { kind: "upcoming", label: "Prochainement", date: dateAt(13) }
);

check(
  "Série déjà sortie, nouvelle saison (S2E1) dans 15 jours -> trop tôt, null",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-200), episode_number: 8, season_number: 1 },
      next_episode_to_air: { air_date: dateAt(15), episode_number: 1, season_number: 2 },
    },
    TODAY
  ),
  null
);

check(
  "Série déjà sortie, saison en cours (S2E5) dans 6 jours, épisode précédent hors fenêtre -> prochainement",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-20), episode_number: 4, season_number: 2 },
      next_episode_to_air: { air_date: dateAt(6), episode_number: 5, season_number: 2 },
    },
    TODAY
  ),
  { kind: "upcoming", label: "Prochainement", date: dateAt(6) }
);

check(
  "Série déjà sortie, saison en cours (S2E5) dans 8 jours -> trop tôt, null",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-40), episode_number: 4, season_number: 2 },
      next_episode_to_air: { air_date: dateAt(8), episode_number: 5, season_number: 2 },
    },
    TODAY
  ),
  null
);

// --- Vient de sortir --------------------------------------------------------

check(
  "Nouvelle série (S1E1) sortie il y a 13 jours -> vient de sortir",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-13), episode_number: 1, season_number: 1 },
      next_episode_to_air: null,
    },
    TODAY
  ),
  { kind: "just_released", label: "Vient de sortir", date: dateAt(-13) }
);

check(
  "Nouvelle série (S1E1) sortie il y a 15 jours -> trop tard, null",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-15), episode_number: 1, season_number: 1 },
      next_episode_to_air: null,
    },
    TODAY
  ),
  null
);

check(
  "Nouvelle saison (S3E1) sortie il y a 6 jours -> vient de sortir",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-6), episode_number: 1, season_number: 3 },
      next_episode_to_air: null,
    },
    TODAY
  ),
  { kind: "just_released", label: "Vient de sortir", date: dateAt(-6) }
);

check(
  "Nouvel épisode (S3E4, pas le premier) sorti il y a 6 jours -> vient de sortir",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-6), episode_number: 4, season_number: 3 },
      next_episode_to_air: { air_date: dateAt(1), episode_number: 5, season_number: 3 },
    },
    TODAY
  ),
  { kind: "just_released", label: "Vient de sortir", date: dateAt(-6) }
);

check(
  "Nouvel épisode (S3E4) sorti il y a 8 jours -> trop tard, null",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-8), episode_number: 4, season_number: 3 },
      next_episode_to_air: null,
    },
    TODAY
  ),
  null
);

// --- Priorités / cas limites -------------------------------------------

check(
  "Chevauchement : dernier épisode vient de sortir (2j) ET le prochain est déjà 'prochainement' (6j) -> vient de sortir prioritaire",
  getSeriesEpisodeBadge(
    {
      last_episode_to_air: { air_date: dateAt(-2), episode_number: 4, season_number: 3 },
      next_episode_to_air: { air_date: dateAt(6), episode_number: 5, season_number: 3 },
    },
    TODAY
  ),
  { kind: "just_released", label: "Vient de sortir", date: dateAt(-2) }
);

check(
  "Série terminée (ni next ni last) -> null",
  getSeriesEpisodeBadge({ last_episode_to_air: null, next_episode_to_air: null }, TODAY),
  null
);

check(
  "Aucune donnée (undefined) -> null, pas de crash",
  getSeriesEpisodeBadge(undefined, TODAY),
  null
);

console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
