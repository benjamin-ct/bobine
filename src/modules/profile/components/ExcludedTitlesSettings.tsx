import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { useExcludedTitles } from "../../../core/context/ExcludedTitlesContext.tsx";
import { Disclosure } from "../../../shared/components/index.ts";
import styles from "./SettingsPanel.module.css";

const CROSS_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

// NOUVEAU (repris de la maquette HTML, absent du Projet A avant migration) :
// liste des titres exclus individuellement (bouton "Exclure ce titre" sur
// la fiche détail, voir ExcludedTitlesContext). Le titre affiché ici est
// résolu depuis la bibliothèque locale (déjà vu / envie de voir) quand
// disponible — sinon on affiche juste l'identifiant TMDB, sans appel réseau
// dédié pour un simple récapitulatif de réglage.
export default function ExcludedTitlesSettings() {
  const { excludedTitleKeys, toggleExcludedTitle } = useExcludedTitles();
  const { watched, watchlist } = useLibrary();

  const knownTitles = new Map<string, string>();
  for (const item of [...watched, ...watchlist]) {
    knownTitles.set(`${item.mediaType}:${item.id}`, item.title);
  }

  return (
    <Disclosure
      summary="Titres exclus"
      meta={`${excludedTitleKeys.length} exclu${excludedTitleKeys.length > 1 ? "s" : ""}`}
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
                {knownTitles.get(key) || `Titre #${id}`} {CROSS_SVG}
              </button>
            );
          })
        )}
      </div>
    </Disclosure>
  );
}
