import { useState } from "react";
import { getSeasonDetails } from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";

// `item` : forme minimale de la série (id, mediaType, title, posterPath,
// date, genreIds) — voir libItem dans Detail.jsx. `seasons` vient de
// details.seasons (TMDB), qui donne le nombre d'épisodes par saison mais
// pas leur liste : celle-ci n'est chargée qu'à l'ouverture d'une saison
// (voir getSeasonDetails, un appel TMDB dédié par saison).
export default function EpisodeTracker({ item, seasons }) {
  const { getWatchedEpisodes, isEpisodeWatched, toggleEpisodeWatched, setSeasonEpisodesWatched } = useLibrary();
  const [openSeason, setOpenSeason] = useState(null);
  const [episodesBySeason, setEpisodesBySeason] = useState({});
  const [loadingSeason, setLoadingSeason] = useState(null);

  const realSeasons = seasons.filter((s) => s.episode_count > 0);
  const watchedEpisodes = getWatchedEpisodes(item.mediaType, item.id);
  const totalEpisodes = realSeasons.reduce((sum, s) => sum + s.episode_count, 0);

  function countWatchedInSeason(seasonNumber) {
    let count = 0;
    for (const key of watchedEpisodes) {
      if (key.startsWith(`${seasonNumber}-`)) count += 1;
    }
    return count;
  }

  async function toggleSeason(seasonNumber) {
    if (openSeason === seasonNumber) {
      setOpenSeason(null);
      return;
    }
    setOpenSeason(seasonNumber);
    if (episodesBySeason[seasonNumber]) return;
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

  if (totalEpisodes === 0) return null;

  return (
    <section className="episode-tracker">
      <h3>
        Épisodes <span className="episode-tracker__total">({watchedEpisodes.size}/{totalEpisodes} vus)</span>
      </h3>
      <div className="season-list">
        {realSeasons.map((season) => {
          const seasonWatchedCount = countWatchedInSeason(season.season_number);
          const isOpen = openSeason === season.season_number;
          const episodes = episodesBySeason[season.season_number];
          const allWatched = seasonWatchedCount === season.episode_count;

          return (
            <div className="season-group" key={season.season_number}>
              <button
                type="button"
                className="season-group__header"
                onClick={() => toggleSeason(season.season_number)}
                aria-expanded={isOpen}
              >
                <span className="season-group__name">{season.name || `Saison ${season.season_number}`}</span>
                <span className={`season-group__count${allWatched ? " season-group__count--done" : ""}`}>
                  {seasonWatchedCount}/{season.episode_count}
                </span>
                <span className="season-group__chevron">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="season-group__body">
                  {loadingSeason === season.season_number && <p className="page-subtitle">Chargement…</p>}

                  {episodes?.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="chip"
                        onClick={() =>
                          setSeasonEpisodesWatched(
                            item,
                            season.season_number,
                            episodes.map((ep) => ep.episode_number),
                            !allWatched
                          )
                        }
                      >
                        {allWatched ? "Tout décocher" : "Tout marquer comme vu"}
                      </button>
                      <ul className="episode-list">
                        {episodes.map((ep) => (
                          <li key={ep.id ?? ep.episode_number} className="episode-row">
                            <label>
                              <input
                                type="checkbox"
                                checked={isEpisodeWatched(item.mediaType, item.id, season.season_number, ep.episode_number)}
                                onChange={() => toggleEpisodeWatched(item, season.season_number, ep.episode_number)}
                              />
                              <span className="episode-row__number">E{ep.episode_number}</span>
                              <span className="episode-row__title">{ep.name || "Sans titre"}</span>
                              {ep.air_date && (
                                <span className="episode-row__date">
                                  {new Date(ep.air_date).toLocaleDateString("fr-FR")}
                                </span>
                              )}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {episodes?.length === 0 && (
                    <p className="page-subtitle">Aucun épisode trouvé pour cette saison.</p>
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
