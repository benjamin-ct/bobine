// Plateformes de streaming "globales", disponibles dans la quasi-totalité
// des pays couverts par TMDB — contrairement à certaines entrées de
// MAIN_PROVIDER_IDS (tmdb.ts) qui sont français-only (Canal+, Arte, M6+).
// Toujours proposées dans FavoriteProvidersSettings, même si l'API TMDB
// /watch/providers ne les liste pas explicitement pour la région détectée
// (couverture TMDB parfois incomplète sur les pays moins densément
// documentés). Liste volontairement restreinte aux services les plus
// universellement disponibles ; à ajuster si besoin (voir ticket
// "Fusion plateformes globales + régionales dans les réglages profil").
//
// Fonction PURE (aucun appel réseau ni `import.meta.env`), testable sous
// Node natif (voir scripts/verify-global-providers.ts) — même principe que
// releaseBadge.ts/movieMeta.ts.
export interface ProviderOption {
  id: number;
  name: string;
}

const GLOBAL_PROVIDER_NAMES: Record<number, string> = {
  8: "Netflix",
  119: "Amazon Prime Video",
  337: "Disney Plus",
  350: "Apple TV",
};

export const GLOBAL_PROVIDER_IDS = new Set<number>(Object.keys(GLOBAL_PROVIDER_NAMES).map(Number));

// Fusionne les plateformes régionales (déjà résolues via TMDB pour le pays
// détecté, avec leur nom localisé et leur tri de pertinence) avec les
// plateformes globales manquantes — sans doublon, régionales en tête
// (préserve leur tri existant), globales manquantes ajoutées à la suite.
export function withGlobalProviders(regional: ProviderOption[]): ProviderOption[] {
  const foundIds = new Set(regional.map((p) => p.id));
  const missingGlobals = [...GLOBAL_PROVIDER_IDS]
    .filter((id) => !foundIds.has(id))
    .map((id) => ({ id, name: GLOBAL_PROVIDER_NAMES[id] }));
  return [...regional, ...missingGlobals];
}
