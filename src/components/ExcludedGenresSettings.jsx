import { useEffect, useState } from "react";
import { getGenres } from "../api/tmdb";
import { useExcludedGenres } from "../context/ExcludedGenresContext";

// Réglage "Genres à exclure" : cocher une fois les genres qu'on ne veut
// jamais voir suggérés, pour filtrer Découvrir/Nouveautés/Prochainement/
// Aléatoire et les recommandations d'une fiche. Même convention que
// FavoriteProvidersSettings.jsx, mais sans champ de recherche : il n'y a
// qu'une trentaine de genres TMDB au total (films + séries fusionnés).
export default function ExcludedGenresSettings() {
  const { excludedGenreIds, toggleExcludedGenre } = useExcludedGenres();
  const [open, setOpen] = useState(false);
  const [genres, setGenres] = useState([]);
  const [status, setStatus] = useState("idle");

  // Chargé seulement à l'ouverture du panneau : pas besoin d'un appel TMDB
  // supplémentaire si personne ne touche jamais à ce réglage.
  useEffect(() => {
    if (!open || status !== "idle") return;
    let cancelled = false;
    setStatus("loading");
    Promise.all([getGenres("movie"), getGenres("tv")])
      .then(([movieGenres, tvGenres]) => {
        if (cancelled) return;
        // Un même genre (ex. Comédie) a le même id côté TMDB pour films et
        // séries — on fusionne pour proposer une seule liste, pas une par
        // type (même principe que Stats.jsx/MyList.jsx pour le genreMap).
        const merged = new Map();
        for (const g of [...(movieGenres.genres || []), ...(tvGenres.genres || [])]) {
          if (!merged.has(g.id)) merged.set(g.id, g);
        }
        setGenres([...merged.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // `status` est volontairement absent des deps, voir FavoriteProvidersSettings.jsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="favorite-providers">
      <button type="button" className="chip" onClick={() => setOpen((o) => !o)}>
        {open ? "▲" : "▼"} Genres à exclure{excludedGenreIds.length > 0 ? ` (${excludedGenreIds.length})` : ""}
      </button>
      <p className="page-subtitle favorite-providers__hint">
        Coche les genres que tu ne veux jamais voir suggérés sur Découvrir, Nouveautés, Prochainement, Aléatoire et
        dans les recommandations d'une fiche.
      </p>

      {open && (
        <div className="favorite-providers__panel">
          {status === "loading" && <p className="page-subtitle">Chargement des genres…</p>}
          {status === "error" && <p className="page-subtitle">Impossible de charger la liste des genres pour le moment.</p>}
          {status === "success" && (
            <div className="favorite-providers__grid">
              {genres.map((g) => (
                <label key={g.id} className="favorite-providers__item">
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
        </div>
      )}
    </div>
  );
}
