import { useEffect, useState } from "react";
import { getGenres } from "../../../core/api/tmdb.ts";
import { useExcludedGenres } from "../../../core/context/ExcludedGenresContext.tsx";
import { Disclosure } from "../../../shared/components/index.ts";
import type { Genre } from "../../../core/types/tmdb.ts";
import styles from "./SettingsPanel.module.css";

// Réglage "Genres à exclure" : cocher une fois les genres qu'on ne veut
// jamais voir suggérés, pour filtrer Découvrir/Nouveautés/Prochainement/
// Aléatoire et les recommandations d'une fiche.
export default function ExcludedGenresSettings() {
  const { excludedGenreIds, toggleExcludedGenre } = useExcludedGenres();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
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
    Promise.all([getGenres("movie"), getGenres("tv")])
      .then(([movieGenres, tvGenres]) => {
        if (cancelled) {
          return;
        }
        const merged = new Map<number, Genre>();
        for (const g of [...(movieGenres.genres || []), ...(tvGenres.genres || [])]) {
          if (!merged.has(g.id)) {
            merged.set(g.id, g);
          }
        }
        setGenres([...merged.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setStatus("success");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  return (
    <Disclosure
      summary="Genres à exclure"
      meta={`${excludedGenreIds.length} exclu${excludedGenreIds.length > 1 ? "s" : ""}`}
      onToggle={(open) => open && setLoaded(true)}
    >
      <p>Ces genres ne seront jamais suggérés, où que ce soit dans Bobine.</p>
      {status === "loading" && <p>Chargement des genres…</p>}
      {status === "error" && <p>Impossible de charger la liste des genres.</p>}
      {status === "success" && (
        <div className={styles.grid}>
          {genres.map((g) => (
            <label key={g.id} className={styles.item}>
              <input
                type="checkbox"
                checked={excludedGenreIds.includes(g.id)}
                onChange={() => toggleExcludedGenre(g.id)}
              />
              {g.name}
            </label>
          ))}
        </div>
      )}
    </Disclosure>
  );
}
