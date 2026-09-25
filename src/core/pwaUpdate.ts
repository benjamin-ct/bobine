// Mise à jour de l'app installée (PWA) sans relance manuelle.
//
// Le service worker (src/sw.ts) s'active tout de suite (skipWaiting +
// clients.claim), mais la page déjà affichée garde l'ancien bundle JS/CSS
// tant qu'elle n'est pas rechargée. Sur iOS, une PWA qui revient de
// l'arrière-plan ne navigue pas : le navigateur ne vérifie même pas s'il
// existe un nouveau service worker, et l'app affiche une ancienne version
// jusqu'à ce qu'on la ferme complètement (parfois deux fois).
//
// Ici : à chaque retour au premier plan, on demande une vérification ; quand
// le nouveau service worker prend le contrôle, on recharge la page. Le
// rechargement n'est immédiat que juste après l'ouverture ou le retour au
// premier plan (l'utilisateur n'a encore rien saisi) ; sinon il est reporté
// au prochain retour au premier plan, pour ne jamais perdre une saisie en
// cours.

const RELOAD_WINDOW_MS = 10_000;

export function setupPwaAutoUpdate(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const sw = navigator.serviceWorker;
  // Première installation : pas d'ancienne version à remplacer, donc pas de
  // rechargement quand le service worker prend le contrôle pour la 1re fois.
  let hadController = Boolean(sw.controller);
  let lastShownAt = Date.now();
  let pendingReload = false;
  let reloading = false;

  const reload = () => {
    if (reloading) {
      return;
    }
    reloading = true;
    window.location.reload();
  };

  sw.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (Date.now() - lastShownAt <= RELOAD_WINDOW_MS) {
      reload();
    } else {
      pendingReload = true;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    if (pendingReload) {
      reload();
      return;
    }
    lastShownAt = Date.now();
    sw.getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        // Hors ligne ou service worker indisponible : on réessaiera au
        // prochain retour au premier plan.
      });
  });
}
