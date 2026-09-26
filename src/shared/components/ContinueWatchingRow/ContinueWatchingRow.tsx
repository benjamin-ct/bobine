import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { posterUrl } from "../../../core/api/tmdb.ts";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { posterAccentFromGenres } from "../../lib/posterAccent.ts";
import { lastWatchedEntry, type ResumableSeries } from "../../hooks/useResumableSeries.ts";
import Icon from "../Icon/Icon.tsx";
import posterStyles from "../../styles/posterAccents.module.css";
import styles from "./ContinueWatchingRow.module.css";

interface ContinueWatchingRowProps {
  items: ResumableSeries[];
}

/** "Séries en cours" (Découvrir) / "En cours" (Ma liste) — séries entamées
 * dont le prochain épisode est déjà sorti (voir useResumableSeries). Nouvelle
 * DA : pas de barre de progression ni de bouton lecture, mais où on en est
 * (« Vu jusqu'à S3 · É4 »), le prochain épisode (« À voir : S3 · É5 ») et un
 * bouton « ✓ Vu » qui le coche directement, sans passer par la fiche. Le
 * bouton est hors du <Link> (pas de bouton imbriqué dans un lien). */
export default function ContinueWatchingRow({ items }: ContinueWatchingRowProps) {
  const { t } = useTranslation();
  const { toggleEpisodeWatched } = useLibrary();
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.row}>
      {items.map((item) => {
        const accentKey = posterAccentFromGenres(item.genreIds, `${item.mediaType}:${item.id}`);
        const lastWatched = lastWatchedEntry(item.watchedEpisodes || []);
        const next = item.nextEpisode;
        return (
          <div key={`${item.mediaType}:${item.id}`} className={styles.card}>
            <Link to={`/media/${item.mediaType}/${item.id}`} className={styles.link}>
              <div className={styles.thumb}>
                {item.posterPath ? (
                  <img src={posterUrl(item.posterPath, "w185") ?? undefined} alt={item.title} />
                ) : (
                  <div className={`${styles.thumbEmpty} ${posterStyles[accentKey]}`} />
                )}
              </div>
              <div className={styles.main}>
                <p className={styles.title} title={item.title}>
                  {item.title}
                </p>
                <p className={styles.meta}>
                  {t("continueWatching.watchedUpTo", {
                    season: lastWatched.seasonNumber,
                    episode: lastWatched.episodeNumber,
                  })}
                </p>
                {next && (
                  <p className={styles.next}>
                    {t("continueWatching.nextEpisode", {
                      season: next.seasonNumber,
                      episode: next.episodeNumber,
                    })}
                  </p>
                )}
              </div>
            </Link>
            {next && (
              <button
                type="button"
                className={styles.watchedBtn}
                onClick={() => toggleEpisodeWatched(item, next.seasonNumber, next.episodeNumber)}
                aria-label={t("continueWatching.markWatchedAria", {
                  title: item.title,
                  season: next.seasonNumber,
                  episode: next.episodeNumber,
                })}
              >
                <Icon name="check" strokeWidth={3} /> {t("continueWatching.markWatched")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
