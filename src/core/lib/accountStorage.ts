// Données du compte gardées sur l'appareil (localStorage) : bibliothèque,
// listes perso, réglages de filtrage et marqueurs "déjà synchronisé pour
// <email>". Elles ne doivent plus rester dans le navigateur une fois
// l'utilisateur déconnecté : ces actions sont réservées aux membres
// connectés, et le serveur fait foi à la prochaine connexion.
//
// Restent volontairement sur l'appareil : le thème, la langue et le pays
// (réglages d'affichage appliqués aussi hors connexion), ainsi que
// l'abonnement push de l'appareil (bobine.push.*), nécessaire pour le
// détacher du compte côté serveur (voir core/sync/pushAccountLink.ts).
const ACCOUNT_DATA_KEYS = [
  "bobine.library.v1",
  "bobine.customLists.v1",
  "bobine.watchlistOrder.v1",
  "bobine.excludedTitles.v1",
  "bobine.excludedTitles.labels.v1",
  "bobine.excludedGenres.v1",
  "bobine.favoriteProviders.v1",
];

const SYNCED_FOR_KEYS = [
  "bobine.library.syncedFor",
  "bobine.customLists.syncedFor",
  "bobine.excludedGenres.syncedFor",
  "bobine.favoriteProviders.syncedFor",
  "bobine.locale.syncedFor",
  "bobine.region.syncedFor",
];

// Vrai si cet appareil a déjà été synchronisé avec un compte : sert à
// repérer une session perdue (expirée, cookie effacé) sans passer par le
// bouton de déconnexion.
export function hasAccountDataOnDevice(): boolean {
  try {
    return SYNCED_FOR_KEYS.some((key) => localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
}

export function clearAccountDataFromDevice(): void {
  try {
    for (const key of [...ACCOUNT_DATA_KEYS, ...SYNCED_FOR_KEYS]) {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage indisponible (mode privé strict...) : rien à effacer.
  }
}
