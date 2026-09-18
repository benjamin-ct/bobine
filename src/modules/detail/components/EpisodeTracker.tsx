import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getSeasonDetails } from "../../../core/api/tmdb.ts";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import type { LibraryItemInput } from "../../../core/types/library.ts";
import type { Episode, Season } from "../../../core/types/tmdb.ts";
import styles from "./EpisodeTracker.module.css";

interface EpisodeTrackerProps {
  item: LibraryItemInput;
  seasons: Season[];
}

// `item` : forme minimale de la série (voir libItem dans DetailPage).
// `seasons` vient de details.seasons (TMDB), qui donne le nombre
// d'épisodes par saison mais pas leur liste : celle-ci n'est chargée qu'à
// l'ouverture d'une saison (un appel TMDB dédié par saison).
export default function EpisodeTracker({ item, seasons }: EpisodeTrackerProps) {
  const { t } = useTranslation();
  const { getWatchedEpisodes, isEpisodeWatched, toggleEpisodeWatched, setSeasonEpisodesWatched } =
    useLibrary();
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, Episode[]>>({});
  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);

  const realSeasons = seasons.filter((s) => s.episode_count > 0);
  const watchedEpisodes = getWatchedEpisodes(item.mediaType, item.id);
  const totalEpisodes = realSeasons.reduce((sum, s) => sum + s.episode_count, 0);

  function countWatchedInSeason(seasonNumber: number): number {
    let count = 0;
    for (const key of watchedEpisodes) {
      if (key.startsWith(`${seasonNumber}-`)) {
        count += 1;
      }
    }
    return count;
  }

  async function toggleSeason(seasonNumber: number) {
    if (openSeason === seasonNumber) {
      setOpenSeason(null);
      return;
    }
    setOpenSeason(seasonNumber);
    if (episodesBySeason[seasonNumber]) {
      return;
    }
    setLoadingSeason(seasonNumber);
    try {
      const data = await getSeasonDetails(item.id, seasonNumber);
      setEpisodesBySeason((prev) => ({ ...prev, [seasonNumber]: data.episodes || [] }));
    } catch {
      setEpisodesBySeason((prev) => ({ ...prev, [seasonNumber]: [] }));
    } finally {
      setLoadingSeason(null);
    }
  }

  if (totalEpisodes === 0) {
    return null;
  }

  return (
    <section className={styles.tracker}>
      <h3>
        {t("episodeTracker.title")}{" "}
        <span className={styles.total}>
          {t("episodeTracker.watchedCount", {
            watched: watchedEpisodes.size,
            total: totalEpisodes,
          })}
        </span>
      </h3>
      <div className={styles.seasonList}>
        {realSeasons.map((season) => {
          const seasonWatchedCount = countWatchedInSeason(season.season_number);
          const isOpen = openSeason === season.season_number;
          const episodes = episodesBySeason[season.season_number];
          const allWatched = seasonWatchedCount === season.episode_count;

          return (
            <div className={styles.seasonGroup} key={season.season_number}>
              <button
                type="button"
                className={styles.seasonHeader}
                onClick={() => toggleSeason(season.season_number)}
                aria-expanded={isOpen}
              >
                <span className={styles.seasonName}>
                  {season.name ||
                    t("episodeTracker.seasonNumber", { number: season.season_number })}
                </span>
                <span
                  className={`${styles.seasonCount} ${allWatched ? styles.seasonCountDone : ""}`}
                >
                  {seasonWatchedCount}/{season.episode_count}
                </span>
                <span className={styles.chevron}>{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className={styles.seasonBody}>
                  {loadingSeason === season.season_number && (
                    <p className={styles.loading}>{t("common.loading")}</p>
                  )}

                  {episodes && episodes.length > 0 && (
                    <>
                      <button
                        type="button"
                        className={styles.markAll}
                        onClick={() =>
                          setSeasonEpisodesWatched(
                            item,
                            season.season_number,
                            episodes.map((ep) => ep.episode_number),
                            !allWatched
                          )
                        }
                      >
                        {allWatched
                          ? t("episodeTracker.uncheckAll")
                          : t("episodeTracker.markAllWatched")}
                      </button>
                      <ul className={styles.episodeList}>
                        {episodes.map((ep) => (
                          <li key={ep.id ?? ep.episode_number} className={styles.episodeRow}>
                            <label>
                              <input
                                type="checkbox"
                                checked={isEpisodeWatched(
                                  item.mediaType,
                                  item.id,
                                  season.season_number,
                                  ep.episode_number
                                )}
                                onChange={() =>
                                  toggleEpisodeWatched(
                                    item,
                                    season.season_number,
                                    ep.episode_number
                                  )
                                }
                              />
                              <span className={styles.epNumber}>E{ep.episode_number}</span>
                              <span className={styles.epTitle}>
                                {ep.name || t("episodeTracker.untitled")}
                              </span>
                              {ep.air_date && (
                                <span className={styles.epDate}>
                                  {new Date(ep.air_date).toLocaleDateString("fr-FR")}
                                </span>
                              )}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {episodes && episodes.length === 0 && (
                    <p className={styles.loading}>{t("episodeTracker.noEpisodesFound")}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
