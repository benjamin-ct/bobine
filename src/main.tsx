import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/global.css";
import App from "./App.tsx";
import { AuthProvider } from "./core/context/AuthContext.tsx";
import { LibraryProvider } from "./core/context/LibraryContext.tsx";
import { RegionProvider } from "./core/context/RegionContext.tsx";
import { FavoriteProvidersProvider } from "./core/context/FavoriteProvidersContext.tsx";
import { ExcludedGenresProvider } from "./core/context/ExcludedGenresContext.tsx";
import { ExcludedTitlesProvider } from "./core/context/ExcludedTitlesContext.tsx";
import { ThemeProvider } from "./core/context/ThemeContext.tsx";
import { ensureSentryInit } from "./core/logger.ts";
import { injectWebAnalytics } from "./core/webAnalytics.ts";

// Best-effort, non bloquant pour le rendu initial : voir logger.ts et
// webAnalytics.ts (no-op tant que les secrets Cloudflare correspondants ne
// sont pas configurés).
ensureSentryInit();
injectWebAnalytics();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Élément #root introuvable dans index.html.");
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <RegionProvider>
          <AuthProvider>
            <FavoriteProvidersProvider>
              <ExcludedGenresProvider>
                <ExcludedTitlesProvider>
                  <LibraryProvider>
                    <App />
                  </LibraryProvider>
                </ExcludedTitlesProvider>
              </ExcludedGenresProvider>
            </FavoriteProvidersProvider>
          </AuthProvider>
        </RegionProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);

// Retire le loader statique de index.html une fois la page entièrement
// chargée (fonts, images, styles), pas seulement une fois React monté :
// le rendu initial ci-dessus est synchrone, mais les ressources externes
// (polices Google Fonts, images) peuvent encore être en cours de
// chargement à ce moment-là.
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
