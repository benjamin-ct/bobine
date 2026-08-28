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

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Élément #root introuvable dans index.html.");
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <RegionProvider>
          <FavoriteProvidersProvider>
            <ExcludedGenresProvider>
              <ExcludedTitlesProvider>
                <AuthProvider>
                  <LibraryProvider>
                    <App />
                  </LibraryProvider>
                </AuthProvider>
              </ExcludedTitlesProvider>
            </ExcludedGenresProvider>
          </FavoriteProvidersProvider>
        </RegionProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
