import { useEffect, useMemo, useState } from "react";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { useExcludedTitles } from "../../../core/context/ExcludedTitlesContext.tsx";
import { Disclosure } from "../../../shared/components/index.ts";
import { getMediaSummary } from "../../../core/api/tmdb.ts";
import styles from "./SettingsPanel.module.css";

const CROSS_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

// NOUVEAU (repris de la maquette HTML, absent du Projet A avant migration) :
// liste des titres exclus individuellement (bouton "Exclure ce titre" sur
// la fiche détail, voir ExcludedTitlesContext). Le titre affiché ici vient
// en priorité de la bibliothèque locale (déjà vu / envie de voir, la plus à
// jour), puis du libellé "Titre (année)" capturé au moment de l'exclusion.
// Ces deux sources sont propres à cet appareil (localStorage) : un titre
// exclu depuis un autre appareil n'y figure pas — on complète alors par un
// appel réseau (voir effet ci-dessous), mis en cache localement ensuite pour
// ne plus avoir à le refaire.
export default function ExcludedTitlesSettings() {
  const { excludedTitleKeys, excludedTitleLabels, toggleExcludedTitle, cacheExcludedTitleLabel } =
    useExcludedTitles();
  const { watched, watchlist } = useLibrary();
  const [loaded, setLoaded] = useState(false);

  const knownTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of [...watched, ...watchlist]) {
      map.set(`${item.mediaType}:${item.id}`, item.title);
    }
    return map;
  }, [watched, watchlist]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    let cancelled = false;
    for (const key of excludedTitleKeys) {
      if (knownTitles.has(key) || excludedTitleLabels[key]) {
        continue;
      }
      const [mediaType, id] = key.split(":") as ["movie" | "tv", string];
      getMediaSummary(mediaType, id)
        .then((summary) => {
          if (cancelled) {
            return;
          }
          const name = summary.title || summary.name;
          if (!name) {
            return;
          }
          const date = summary.release_date || summary.first_air_date;
          cacheExcludedTitleLabel(mediaType, id, date ? `${name} (${date.slice(0, 4)})` : name);
        })
        .catch(() => {
          // Titre supprimé de TMDB ou requête en échec : on garde le
          // fallback "Titre #id", pas d'erreur bloquante pour un libellé.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [loaded, excludedTitleKeys, knownTitles, excludedTitleLabels, cacheExcludedTitleLabel]);

  return (
    <Disclosure
      summary="Titres exclus"
      meta={`${excludedTitleKeys.length} exclu${excludedTitleKeys.length > 1 ? "s" : ""}`}
      onToggle={(open) => open && setLoaded(true)}
    >
      <p>
        Ces titres n'apparaîtront plus dans vos suggestions. Ajoutez-en depuis le bouton « Exclure
        ce titre » sur la fiche d'un film ou d'une série.
      </p>
      <div className={styles.chips}>
        {excludedTitleKeys.length === 0 ? (
          <span className={styles.emptyHint}>Aucun titre exclu pour l'instant.</span>
        ) : (
          excludedTitleKeys.map((key) => {
            const [mediaType, id] = key.split(":") as [string, string];
            return (
              <button
                key={key}
                type="button"
                className={styles.chipX}
                onClick={() => toggleExcludedTitle(mediaType as "movie" | "tv", id)}
                title="Réintégrer ce titre"
              >
                {knownTitles.get(key) || excludedTitleLabels[key] || `Titre #${id}`} {CROSS_SVG}
              </button>
            );
          })
        )}
      </div>
    </Disclosure>
  );
}
