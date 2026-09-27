import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getGenres } from "../../../core/api/tmdb.ts";
import { useExcludedGenres } from "../../../core/context/ExcludedGenresContext.tsx";
import type { Genre } from "../../../core/types/tmdb.ts";
import { SettingsRow } from "./SettingsGroup.tsx";
import styles from "./SettingsPanel.module.css";

// Réglage "Genres à exclure" : les genres qu'on ne veut jamais voir
// suggérés, pour filtrer Découvrir/Nouveautés/Prochainement/Aléatoire et
// les recommandations d'une fiche. Nouvelle DA 8/10 : rangés comme "Mes
// plateformes", en grille de cases à cocher (2 colonnes sur desktop, 1 sur
// mobile), tous visibles d'un coup ; genre exclu = case cochée, ligne corail et nom barré.
export default function ExcludedGenresSettings() {
  const { t } = useTranslation();
  const { excludedGenreIds, toggleExcludedGenre } = useExcludedGenres();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  return (
    <SettingsRow label={t("excludedGenres.summary")} description={t("excludedGenres.description")}>
      <span className={styles.meta}>
        {t("excludedGenres.meta", { count: excludedGenreIds.length })} ·{" "}
        {t("excludedGenres.toggleHint")}
      </span>
      {status === "loading" && <p className={styles.status}>{t("excludedGenres.loading")}</p>}
      {status === "error" && <p className={styles.error}>{t("excludedGenres.error")}</p>}
      {status === "success" && (
        <div className={styles.genreGrid}>
          {genres.map((g) => {
            const excluded = excludedGenreIds.includes(g.id);
            return (
              <label
                key={g.id}
                className={`${styles.provider} ${excluded ? styles.genreExcluded : ""}`}
              >
                <input
                  type="checkbox"
                  className={`${styles.checkbox} ${styles.genreCheckbox}`}
                  checked={excluded}
                  onChange={() => toggleExcludedGenre(g.id)}
                />
                <span>{g.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </SettingsRow>
  );
}
