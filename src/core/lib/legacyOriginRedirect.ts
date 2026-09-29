// Adresses qui ne doivent pas servir l'app : l'ancienne URL de prod (avant
// Seancy, encore servie par l'ancien Worker `bobine` pour les onglets
// ouverts, PWA installées et anciens liens), www et l'adresse workers.dev du
// Worker `seancy`. Toute page chargée depuis l'une d'elles part vers
// seancy.com. Les pages de l'app sont des assets servis sans passer par le
// Worker, qui ne peut donc pas les rediriger lui-même (voir worker/index.ts,
// qui redirige le reste). Cookies et stockage local ne suivent pas le
// changement d'origine : une reconnexion est nécessaire sur seancy.com.
//
// Module à effet de bord, importé en tout premier dans main.tsx.
const REDIRECTED_HOSTNAMES = [
  "bobine.creusatbenjamin.workers.dev",
  "www.seancy.com",
  "seancy.creusatbenjamin.workers.dev",
];
const PRODUCTION_ORIGIN = "https://seancy.com";

if (REDIRECTED_HOSTNAMES.includes(window.location.hostname)) {
  const { pathname, search, hash } = window.location;
  window.location.replace(`${PRODUCTION_ORIGIN}${pathname}${search}${hash}`);
}
