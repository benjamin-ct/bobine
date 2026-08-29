import { useEffect, useState } from "react";
import { getWatchProvidersList } from "../../../core/api/tmdb.ts";
import { useRegion } from "../../../core/context/RegionContext.tsx";
import { useFavoriteProviders } from "../../../core/context/FavoriteProvidersContext.tsx";
import { Disclosure } from "../../../shared/components/index.ts";
import type { WatchProviderOption } from "../../../core/api/tmdb.ts";
import styles from "./SettingsPanel.module.css";

// Réglage "Mes plateformes" : cocher une fois les quelques services qu'on a
// vraiment, pour ensuite filtrer Découvrir/Nouveautés/Aléatoire en un clic
// (chip "🎯 Mes plateformes" dans FilterBar) plutôt que de chercher dans le
// menu déroulant d'~100 entrées à chaque visite.
export default function FavoriteProvidersSettings() {
  const { region } = useRegion();
  const { favoriteProviderIds, toggleFavoriteProvider } = useFavoriteProviders();
  const [providers, setProviders] = useState<WatchProviderOption[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);

  // `status` n'est délibérément PAS une dépendance : ce `setStatus("loading")`
  // synchrone changerait `status` et redéclencherait l'effet immédiatement
  // (avant même que la requête réseau n'aboutisse), ce qui exécute le
  // cleanup ci-dessous et met `cancelled = true` sur la promesse en cours —
  // le composant reste alors bloqué sur "Chargement…" pour toujours, la
  // requête d'origine se terminant plus tard sur un `cancelled` déjà vrai.
  useEffect(() => {
    if (!loaded) {
      return;
    }
    let cancelled = false;
    setStatus("loading");
    Promise.all([getWatchProvidersList("movie", region), getWatchProvidersList("tv", region)])
      .then(([movieList, tvList]) => {
        if (cancelled) {
          return;
        }
        const merged = new Map<number, WatchProviderOption>();
        for (const p of [...movieList, ...tvList]) {
          if (!merged.has(p.id)) {
            merged.set(p.id, p);
          }
        }
        setProviders([...merged.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setStatus("success");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [loaded, region]);

  const trimmedQuery = query.trim().toLowerCase();
  const visibleProviders = trimmedQuery
    ? providers.filter((p) => p.name.toLowerCase().includes(trimmedQuery))
    : providers;

  return (
    <Disclosure
      summary="Mes plateformes"
      meta={`${favoriteProviderIds.length} active${favoriteProviderIds.length > 1 ? "s" : ""}`}
      defaultOpen={false}
      onToggle={(open) => open && setLoaded(true)}
    >
      <p>Cochez les services que vous avez pour filtrer « disponible chez moi » en un clic.</p>
      {status === "loading" && <p>Chargement…</p>}
      {status === "error" && <p>Impossible de charger la liste des plateformes.</p>}
      {status === "success" && (
        <>
          <input
            type="search"
            className={styles.search}
            placeholder="Rechercher une plateforme…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.grid}>
            {visibleProviders.map((p) => (
              <label key={p.id} className={styles.item}>
                <input
                  type="checkbox"
                  checked={favoriteProviderIds.includes(p.id)}
                  onChange={() => toggleFavoriteProvider(p.id)}
                />
                {p.name}
              </label>
            ))}
          </div>
        </>
      )}
    </Disclosure>
  );
}
