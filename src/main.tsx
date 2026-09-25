import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/global.css";
import App from "./App.tsx";
import { AuthProvider } from "./core/context/AuthContext.tsx";
import { LibraryProvider } from "./core/context/LibraryContext.tsx";
import { MembersOnlyProvider } from "./core/context/MembersOnlyContext.tsx";
import { RegionProvider, loadStoredRegion } from "./core/context/RegionContext.tsx";
import { RegionAccountSync } from "./core/context/RegionAccountSync.tsx";
import { DEFAULT_REGION } from "./core/api/releaseBadge.ts";
import { FavoriteProvidersProvider } from "./core/context/FavoriteProvidersContext.tsx";
import { ExcludedGenresProvider } from "./core/context/ExcludedGenresContext.tsx";
import { ExcludedTitlesProvider } from "./core/context/ExcludedTitlesContext.tsx";
import { ThemeProvider } from "./core/context/ThemeContext.tsx";
import { LocaleProvider } from "./core/context/LocaleContext.tsx";
import { LocaleAccountSync } from "./core/context/LocaleAccountSync.tsx";
import { ensureSentryInit } from "./core/logger.ts";
import { injectWebAnalytics } from "./core/webAnalytics.ts";
import { isLikelyAutomatedClient } from "./core/botDetection.ts";
import { setupPwaAutoUpdate } from "./core/pwaUpdate.ts";

// Best-effort, non bloquant pour le rendu initial : voir logger.ts et
// webAnalytics.ts (no-op tant que les secrets Cloudflare correspondants ne
// sont pas configurés).
// Sauté pour un client détecté comme automatisé (voir botDetection.ts) :
// ces deux appels parlent directement à des tiers (Sentry, Cloudflare Web
// Analytics) sans jamais passer par le Worker, donc invisibles à la
// détection de bots qui s'y trouve déjà (worker/bots.ts) — un crawler ne
// devrait ni polluer nos dashboards d'audience, ni consommer notre quota
// d'ingestion d'erreurs Sentry pour des erreurs qu'il déclenche lui-même.
// N'affecte ni le rendu ni le contenu de la page.
if (!isLikelyAutomatedClient(navigator)) {
  ensureSentryInit();
  injectWebAnalytics();
}

// Recharge l'app installée quand une nouvelle version est déployée, au lieu
// de garder l'ancien bundle jusqu'à une relance complète (voir pwaUpdate.ts).
setupPwaAutoUpdate();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Élément #root introuvable dans index.html.");
}

// Résolu avant le premier rendu (pas dans un effet de RegionProvider) pour
// que Discover/Nouveautés/À venir/Au hasard, dont le fetch dépend de la
// région, démarrent directement avec la bonne au lieu de charger une
// première fois avec DEFAULT_REGION puis de se recharger entièrement une
// fois /api/region résolu — c'est ce rechargement complet qui donnait
// l'impression que l'appli clignotait au premier affichage d'une page.
// Le splash statique de index.html couvre cette attente ; le délai est
// borné pour ne jamais bloquer indéfiniment (ex. Worker indisponible).
async function resolveInitialRegion(): Promise<string> {
  // Un choix manuel déjà stocké sur cet appareil (réglages du profil) fait
  // autorité et évite tout appel réseau : /api/region ne sert que de repli
  // tant qu'aucun choix explicite n'existe (voir RegionContext.tsx).
  const stored = loadStoredRegion();
  if (stored) {
    return stored;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch("/api/region", { signal: controller.signal });
    if (!res.ok) {
      return DEFAULT_REGION;
    }
    const data: { country?: string } = await res.json();
    return data.country || DEFAULT_REGION;
  } catch {
    // Repli sur DEFAULT_REGION (timeout, offline, dev local sans Worker) —
    // RegionProvider retente cet appel en tâche de fond après le montage.
    return DEFAULT_REGION;
  } finally {
    clearTimeout(timeout);
  }
}

const initialRegion = await resolveInitialRegion();

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <BrowserRouter>
          <RegionProvider initialRegion={initialRegion}>
            <AuthProvider>
              <LocaleAccountSync>
                <RegionAccountSync>
                  <FavoriteProvidersProvider>
                    <ExcludedGenresProvider>
                      <ExcludedTitlesProvider>
                        <MembersOnlyProvider>
                          <LibraryProvider>
                            <App />
                          </LibraryProvider>
                        </MembersOnlyProvider>
                      </ExcludedTitlesProvider>
                    </ExcludedGenresProvider>
                  </FavoriteProvidersProvider>
                </RegionAccountSync>
              </LocaleAccountSync>
            </AuthProvider>
          </RegionProvider>
        </BrowserRouter>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>
);

// Retire le loader statique de index.html une fois la page entièrement
// chargée (fonts, images, styles), pas seulement une fois React monté :
// les ressources externes (polices Google Fonts, images) peuvent encore
// être en cours de chargement à ce moment-là.
const initialLoader = document.getElementById("app-loader");
if (initialLoader) {
  const hideInitialLoader = () => {
    initialLoader.addEventListener("transitionend", () => initialLoader.remove(), { once: true });
    initialLoader.classList.add("app-loader--hidden");
  };

  if (document.readyState === "complete") {
    hideInitialLoader();
  } else {
    window.addEventListener("load", hideInitialLoader, { once: true });
  }
}
