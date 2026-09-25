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
