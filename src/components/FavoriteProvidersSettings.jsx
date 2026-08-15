import { useEffect, useState } from "react";
import { getWatchProvidersList } from "../api/tmdb";
import { useRegion } from "../context/RegionContext";
import { useFavoriteProviders } from "../context/FavoriteProvidersContext";

// Réglage "Mes plateformes" : cocher une fois les quelques services qu'on a
// vraiment, pour ensuite filtrer Découvrir/Nouveautés/Aléatoire en un clic
// (chip "🎯 Mes plateformes" dans FilterBar) plutôt que de chercher dans le
// menu déroulant d'~100 entrées à chaque visite. Panneau repliable, même
// convention que AdvancedFilters.jsx.
export default function FavoriteProvidersSettings() {
  const { region } = useRegion();
  const { favoriteProviderIds, toggleFavoriteProvider } = useFavoriteProviders();
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [status, setStatus] = useState("idle");
  const [query, setQuery] = useState("");

  // Chargé seulement à l'ouverture du panneau : pas besoin d'un appel TMDB
  // supplémentaire si personne ne touche jamais à ce réglage.
  useEffect(() => {
    if (!open || status !== "idle") return;
    let cancelled = false;
    setStatus("loading");
    Promise.all([getWatchProvidersList("movie", region), getWatchProvidersList("tv", region)])
      .then(([movieList, tvList]) => {
        if (cancelled) return;
        // Un même service (ex. Netflix) a le même provider_id côté TMDB pour
        // films et séries — on fusionne pour proposer une seule liste, pas
        // une par type.
        const merged = new Map();
        for (const p of [...movieList, ...tvList]) {
          if (!merged.has(p.id)) merged.set(p.id, p);
        }
        setProviders([...merged.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // `status` est volontairement absent des deps : il est modifié par cet
    // effet lui-même (idle -> loading -> success/error). Le déclarer en
    // dépendance ferait exécuter le cleanup (cancelled = true) dès le
    // passage à "loading", annulant le fetch tout juste lancé avant même
    // qu'il n'ait pu résoudre — la garde `status !== "idle"` ci-dessus
    // suffit à empêcher un second fetch tant que le panneau reste ouvert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, region]);

  const trimmedQuery = query.trim().toLowerCase();
  const visibleProviders = trimmedQuery
    ? providers.filter((p) => p.name.toLowerCase().includes(trimmedQuery))
    : providers;

  return (
    <div className="favorite-providers">
      <button type="button" className="chip" onClick={() => setOpen((o) => !o)}>
        {open ? "▲" : "▼"} Mes plateformes{favoriteProviderIds.length > 0 ? ` (${favoriteProviderIds.length})` : ""}
      </button>
      <p className="page-subtitle favorite-providers__hint">
        Coche les services que tu as vraiment pour filtrer Découvrir, Nouveautés et Aléatoire sur « disponible chez
        moi » en un clic.
      </p>

      {open && (
        <div className="favorite-providers__panel">
          {status === "loading" && <p className="page-subtitle">Chargement des plateformes…</p>}
          {status === "error" && (
            <p className="page-subtitle">Impossible de charger la liste des plateformes pour le moment.</p>
          )}
          {status === "success" && (
            <>
              <input
                type="search"
                className="favorite-providers__search"
                placeholder="Rechercher une plateforme…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="favorite-providers__grid">
                {visibleProviders.map((p) => (
                  <label key={p.id} className="favorite-providers__item">
                    <input
                      type="checkbox"
                      checked={favoriteProviderIds.includes(p.id)}
                      onChange={() => toggleFavoriteProvider(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
                {visibleProviders.length === 0 && (
                  <p className="page-subtitle">Aucune plateforme ne correspond à « {query.trim()} ».</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
