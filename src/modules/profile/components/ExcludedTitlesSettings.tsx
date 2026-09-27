import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { useExcludedTitles } from "../../../core/context/ExcludedTitlesContext.tsx";
import { getMediaSummary, posterUrl } from "../../../core/api/tmdb.ts";
import type { MediaType } from "../../../core/types/tmdb.ts";
import { SettingsRow } from "./SettingsGroup.tsx";
import styles from "./SettingsPanel.module.css";

interface TitleInfo {
  title: string;
  year: string | null;
  posterPath: string | null;
}

// Libellé "Titre (année)" capturé au moment de l'exclusion (voir
// ExcludedTitlesContext) : redécoupé pour afficher l'année à part.
function parseLabel(label: string): TitleInfo {
  const match = /^(.*) \((\d{4})\)$/.exec(label);
  return match
    ? { title: match[1], year: match[2], posterPath: null }
    : { title: label, year: null, posterPath: null };
}

// NOUVEAU (repris de la maquette HTML, absent du Projet A avant migration) :
// liste des titres exclus individuellement (bouton "Exclure ce titre" sur
// la fiche détail, voir ExcludedTitlesContext). Titre, année et affiche
// viennent en priorité de la bibliothèque locale (déjà vu / envie de voir),
// sinon d'un appel TMDB (mis en cache par getMediaSummary) ; en attendant,
// le libellé "Titre (année)" capturé au moment de l'exclusion sert de
// repli. Ces libellés sont propres à cet appareil (localStorage) : un titre
// exclu depuis un autre appareil n'en a pas, d'où la mise en cache locale du
// libellé une fois récupéré.
export default function ExcludedTitlesSettings() {
  const { t } = useTranslation();
  const { excludedTitleKeys, excludedTitleLabels, toggleExcludedTitle, cacheExcludedTitleLabel } =
    useExcludedTitles();
  const { watched, watchlist } = useLibrary();
  const [fetched, setFetched] = useState<Record<string, TitleInfo>>({});

  const knownTitles = useMemo(() => {
    const map = new Map<string, TitleInfo>();
    for (const item of [...watched, ...watchlist]) {
      map.set(`${item.mediaType}:${item.id}`, {
        title: item.title,
        year: item.date?.slice(0, 4) || null,
        posterPath: item.posterPath,
      });
    }
    return map;
  }, [watched, watchlist]);

  useEffect(() => {
    let cancelled = false;
    for (const key of excludedTitleKeys) {
      if (knownTitles.has(key) || fetched[key]) {
        continue;
      }
      const [mediaType, id] = key.split(":") as [MediaType, string];
      getMediaSummary(mediaType, id)
        .then((summary) => {
          if (cancelled) {
            return;
          }
          const name = summary.title || summary.name;
          if (!name) {
            return;
          }
          const year = (summary.release_date || summary.first_air_date)?.slice(0, 4) || null;
          setFetched((prev) => ({
            ...prev,
            [key]: { title: name, year, posterPath: summary.poster_path ?? null },
          }));
          if (!excludedTitleLabels[key]) {
            cacheExcludedTitleLabel(mediaType, id, year ? `${name} (${year})` : name);
          }
        })
        .catch(() => {
          // Titre supprimé de TMDB ou requête en échec : on garde le
          // libellé capturé ou "Titre #id", pas d'erreur bloquante.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [excludedTitleKeys, knownTitles, fetched, excludedTitleLabels, cacheExcludedTitleLabel]);

  return (
    <SettingsRow
      label={t("excludedTitlesSettings.title")}
      description={t("excludedTitlesSettings.description")}
    >
      <span className={styles.meta}>
        {t("excludedTitlesSettings.excludedCount", { count: excludedTitleKeys.length })}
      </span>
      {excludedTitleKeys.length === 0 ? (
        <p className={styles.emptyHint}>{t("excludedTitlesSettings.empty")}</p>
      ) : (
        <ul className={styles.titles}>
          {excludedTitleKeys.map((key) => {
            const [mediaType, id] = key.split(":") as [MediaType, string];
            const info = knownTitles.get(key) ||
              fetched[key] ||
              (excludedTitleLabels[key] && parseLabel(excludedTitleLabels[key])) || {
                title: t("excludedTitlesSettings.unknownTitle", { id }),
                year: null,
                posterPath: null,
              };
            const poster = posterUrl(info.posterPath, "w92");
            const type = t(
              mediaType === "tv"
                ? "excludedTitlesSettings.typeTv"
                : "excludedTitlesSettings.typeMovie"
            );
            return (
              <li key={key} className={styles.titleRow}>
                {poster ? (
                  <img src={poster} alt="" className={styles.thumb} loading="lazy" />
                ) : (
                  <span className={styles.thumb} aria-hidden="true" />
                )}
                <span className={styles.titleText}>
                  <strong>{info.title}</strong>
                  <span>{info.year ? `${type} · ${info.year}` : type}</span>
                </span>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => toggleExcludedTitle(mediaType, id)}
                  aria-label={`${t("excludedTitlesSettings.reinclude")} · ${info.title}`}
                >
                  {t("excludedTitlesSettings.reinclude")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsRow>
  );
}
