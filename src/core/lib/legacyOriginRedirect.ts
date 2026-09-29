// Ancienne URL de prod (avant Seancy) : l'app y est encore servie (onglets
// ouverts, PWA installées, anciens liens), mais toute page chargée part vers
// seancy.com. Les pages de l'app sont des assets servis sans passer par le
// Worker, qui ne peut donc pas les rediriger lui-même (voir worker/index.ts,
// qui redirige le reste). Même Worker et même base derrière les deux URLs,
// mais cookies et stockage local ne suivent pas le changement d'origine :
// une reconnexion est nécessaire sur seancy.com.
//
// Module à effet de bord, importé en tout premier dans main.tsx.
const LEGACY_PRODUCTION_HOSTNAME = "bobine.creusatbenjamin.workers.dev";
const PRODUCTION_ORIGIN = "https://seancy.com";

if (window.location.hostname === LEGACY_PRODUCTION_HOSTNAME) {
  const { pathname, search, hash } = window.location;
  window.location.replace(`${PRODUCTION_ORIGIN}${pathname}${search}${hash}`);
}
