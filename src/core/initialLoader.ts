// Loader statique de index.html (#app-loader), affiché avant que React ne
// soit chargé. Retiré juste après le premier rendu (voir App.tsx) plutôt
// qu'à `window.load` (audit M8) : `load` attend toutes les ressources déjà
// demandées (images comprises), mais peut aussi survenir avant que React
// n'ait rendu quoi que ce soit, ce qui dévoilait une page encore vide.
let hidden = false;

export function hideInitialLoader(): void {
  if (hidden) {
    return;
  }
  hidden = true;
  const loader = document.getElementById("app-loader");
  if (!loader) {
    return;
  }
  loader.addEventListener("transitionend", () => loader.remove(), { once: true });
  loader.classList.add("app-loader--hidden");
}
