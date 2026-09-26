// Slugs des liens de partage publics (profil, listes perso) : 96 bits
// aléatoires encodés en base64url sur 16 caractères — non devinables, donc
// seules les personnes ayant reçu le lien peuvent consulter la page.
export function randomShareSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export const SHARE_SLUG_PATTERN = /^[A-Za-z0-9_-]{16}$/;

// Pseudo public (migration 0014) : minuscules, chiffres et « _ », 3 à 15
// caractères. Jamais 16 caractères, pour que /u/<x> reste non ambigu entre
// un pseudo et un slug aléatoire (SHARE_SLUG_PATTERN).
export const USERNAME_PATTERN = /^[a-z0-9_]{3,15}$/;

// Normalise la saisie (espaces, « @ » initial, majuscules) avant validation :
// « @Ben_C » et « ben_c » désignent le même pseudo. Renvoie `null` si le
// résultat ne respecte pas USERNAME_PATTERN.
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const username = value.trim().replace(/^@/, "").toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}
