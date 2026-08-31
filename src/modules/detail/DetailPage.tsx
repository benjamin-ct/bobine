import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  backdropUrl,
  posterUrl,
  getDetails,
  watchProvidersFromDetails,
  estimateRuntimeMinutes,
  getFrenchTheatricalDateFromDetails,
  theatricalStatusFromDate,
  formatFullDate,
} from "../../core/api/tmdb.ts";
import {
  ProviderBadges,
  TrailerButton,
  MediaCard,
  PersonCard,
  RatingStars,
  ErrorMessage,
  Dropdown,
} from "../../shared/components/index.ts";
import EpisodeTracker from "./components/EpisodeTracker.tsx";
import CollectionSection from "./components/CollectionSection.tsx";
import DetailSkeleton from "./components/DetailSkeleton.tsx";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import { useRegion } from "../../core/context/RegionContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import { posterAccentFromGenres } from "../../shared/lib/posterAccent.ts";
import { ratingTier } from "../../shared/lib/ratingTier.ts";
import { getMediaPreview, type MediaPreview } from "../../shared/lib/mediaPreviewCache.ts";
import posterStyles from "../../shared/styles/posterAccents.module.css";
import dropdownStyles from "../../shared/components/Dropdown/Dropdown.module.css";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import type { MediaDetails, MediaType, RegionWatchProviders } from "../../core/types/tmdb.ts";
import styles from "./DetailPage.module.css";

const MAIN_CAST_COUNT = 12;

export default function DetailPage() {
  const navigate = useNavigate();
  const { mediaType, id } = useParams<{ mediaType: MediaType; id: string }>();
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [providers, setProviders] = useState<RegionWatchProviders | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<Error | null>(null);
  const [preview, setPreview] = useState<MediaPreview | null>(null);
  const [showFullCast, setShowFullCast] = useState(false);
  const [newListName, setNewListName] = useState("");
  const {
    isWatched,
    isInWatchlist,
    toggleWatched,
    toggleWatchlist,
    getRating,
    rateWatched,
    customLists,
    isInList,
    addToList,
    removeFromList,
    createList,
  } = useLibrary();
  const { region, regionName } = useRegion();
  const { excludedGenreIds } = useExcludedGenres();
  const { isExcludedTitle, toggleExcludedTitle } = useExcludedTitles();
  const recommendationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mediaType || !id) {
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setShowFullCast(false);
    setPreview(getMediaPreview(mediaType, id));
    getDetails(mediaType, id)
      .then((d) => {
        if (cancelled) {
          return;
        }
        setDetails(d);
        setProviders(watchProvidersFromDetails(d, region));
        setStatus("success");
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mediaType, id, region]);

  // Saute directement aux titres similaires si on arrive via le bouton "🔁".
  useEffect(() => {
    if (status === "success" && window.location.hash === "#recommendations") {
      recommendationsRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [status]);

  if (!mediaType || !id) {
    return null;
  }
  if (status === "loading") {
    return (
      <div className={styles.page}>
        <DetailSkeleton preview={preview} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={styles.page}>
        <ErrorMessage error={error} />
      </div>
    );
  }
  if (!details) {
    return null;
  }

  const title = details.title || details.name || "Titre inconnu";
  const date = details.release_date || details.first_air_date;
  const runtime = details.runtime || details.episode_run_time?.[0];
  const watched = isWatched(mediaType, id);
  const inWatchlist = isInWatchlist(mediaType, id);
  const excluded = isExcludedTitle(mediaType, id);
  const accentKey = posterAccentFromGenres(
    details.genres?.map((g) => g.id),
    `${mediaType}:${id}`
  );

  const theatricalDate = mediaType === "movie" ? getFrenchTheatricalDateFromDetails(details) : null;
  const theatricalStatus = theatricalStatusFromDate(theatricalDate);
  const theatricalDateFormatted = theatricalDate ? formatFullDate(theatricalDate) : null;
  const theatricalMessage = theatricalStatus
    ? {
        in_theaters: `🎬 Actuellement au cinéma (sorti le ${theatricalDateFormatted})`,
        upcoming: `🗓️ Sortie au cinéma prévue le ${theatricalDateFormatted}`,
        past: `Sorti au cinéma le ${theatricalDateFormatted}`,
      }[theatricalStatus]
    : null;

  const cast = details.credits?.cast || [];
  const visibleCast = showFullCast ? cast : cast.slice(0, MAIN_CAST_COUNT);
  const remainingCastCount = cast.length - visibleCast.length;

  type DirectorEntry = { id: number; name: string; profilePath: string | null };
  const directors: DirectorEntry[] =
    mediaType === "movie"
      ? (details.credits?.crew || [])
          .filter((c) => c.job === "Director")
          .map((c) => ({ id: c.id, name: c.name, profilePath: c.profile_path ?? null }))
      : (details.created_by || []).map((c) => ({ id: c.id, name: c.name, profilePath: null }));

  const libItem = {
    id: Number(id),
    mediaType,
    title,
    posterPath: details.poster_path ?? null,
    date,
    genreIds: details.genres?.map((g) => g.id) || [],
    runtimeMinutes: estimateRuntimeMinutes(details, mediaType),
  };

  // TMDB n'a pas de paramètre d'exclusion par genre sur l'endpoint
  // recommandations : on filtre côté client sur les genres exclus.
  const recommendations = (details.recommendations?.results || []).filter(
    (item) => !item.genre_ids?.some((gId) => excludedGenreIds.includes(gId))
  );

  function scrollToRecommendations() {
    recommendationsRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function submitNewList() {
    const trimmed = newListName.trim();
    // Re-vérifié ici (déjà garanti par le early-return plus haut) : TypeScript
    // ne propage pas le rétrécissement de type d'une closure englobante dans
    // une déclaration de fonction imbriquée comme celle-ci.
    if (!trimmed || !mediaType || !id) {
      return;
    }
    const listId = createList(trimmed);
    if (listId) {
      addToList(listId, mediaType, id);
      setNewListName("");
    }
  }

  const tier = details.vote_average != null ? ratingTier(details.vote_average) : null;

  return (
    <div className={styles.page}>
      <Link
        to="/"
        className={styles.back}
        onClick={(e) => {
          // navigate(-1) déclenche un vrai retour arrière (POP), nécessaire
          // pour que useScrollRestoration restaure la position de la liste
          // d'origine — un <Link> classique crée une nouvelle entrée
          // d'historique (PUSH) et ne restaure jamais rien.
          e.preventDefault();
          navigate(-1);
        }}
      >
        ← Retour
      </Link>

      <div className={`${styles.hero} ${posterStyles[accentKey]}`}>
        {details.backdrop_path && (
          <div
            className={styles.backdrop}
            style={{ backgroundImage: `url(${backdropUrl(details.backdrop_path)})` }}
          />
        )}
        <div className={styles.heroOverlay} />
        <div className={styles.heroInner}>
          <div className={styles.posterWrap}>
            {details.poster_path ? (
              <img
                src={posterUrl(details.poster_path, "w342") ?? undefined}
                alt={title}
                className={styles.poster}
              />
            ) : (
              <div className={`${styles.poster} ${styles.posterEmpty} ${posterStyles[accentKey]}`}>
                {title}
              </div>
            )}
          </div>
          <div className={styles.info}>
            <h1 className={styles.title}>
              {title}{" "}
              {date && (
                <span className={styles.year}>({formatFullDate(date) || date.slice(0, 4)})</span>
              )}
            </h1>
            <p className={styles.meta}>
              {details.genres?.map((g) => g.name).join(" · ")}
              {mediaType === "tv" && details.number_of_seasons
                ? ` · ${details.number_of_seasons} saison${details.number_of_seasons > 1 ? "s" : ""}`
                : ""}
              {mediaType === "tv" && details.number_of_episodes
                ? ` · ${details.number_of_episodes} épisodes`
                : ""}
              {runtime ? ` · ${runtime} min${mediaType === "tv" ? "/épisode" : ""}` : ""}
              {details.vote_average && tier ? (
                <span className={`${styles.score} ${styles[`s-${tier.cls}`]}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" />
                  </svg>
                  {details.vote_average.toFixed(1)}
                </span>
              ) : null}
            </p>
            {theatricalMessage && <p className={styles.statusPill}>{theatricalMessage}</p>}
            <p className={styles.overview}>{details.overview || "Pas de synopsis disponible."}</p>

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.actionBtn} ${watched ? styles.actionBtnOn : ""}`}
                onClick={() => toggleWatched(libItem)}
                aria-pressed={watched}
              >
                {watched ? "✔ Déjà vu" : "○ Marquer comme vu"}
              </button>
              <button
                type="button"
                className={`${styles.actionBtnSecondary} ${inWatchlist ? styles.actionBtnSecondaryOn : ""}`}
                onClick={() => toggleWatchlist(libItem)}
                aria-pressed={inWatchlist}
              >
                {inWatchlist ? "★ Envie de voir" : "☆ Envie de voir"}
              </button>
            </div>
            <div className={styles.actionsSecondary}>
              <TrailerButton videos={details.videos?.results} />
              <Dropdown
                label="Ajouter à…"
                active={customLists.some((list) => isInList(list.id, mediaType, id))}
              >
                <div className={dropdownStyles.head}>Ajouter à une liste</div>
                {customLists.length === 0 && (
                  <p className={styles.emptyHint}>Aucune liste pour l'instant.</p>
                )}
                {customLists.map((list) => {
                  const on = isInList(list.id, mediaType, id);
                  return (
                    <button
                      key={list.id}
                      type="button"
                      className={`${dropdownStyles.option} ${on ? dropdownStyles.optionOn : ""}`}
                      onClick={() => (on ? removeFromList : addToList)(list.id, mediaType, id)}
                    >
                      <span className={dropdownStyles.check}>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          aria-hidden="true"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      {list.name}
                    </button>
                  );
                })}
                <div className={styles.newListRow}>
                  <input
                    type="text"
                    placeholder="Créer une liste…"
                    maxLength={40}
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNewList()}
                  />
                  <button type="button" onClick={submitNewList}>
                    Créer
                  </button>
                </div>
              </Dropdown>
              {recommendations.length > 0 && (
                <button type="button" className={styles.ghostBtn} onClick={scrollToRecommendations}>
                  🔁 Similaire
                </button>
              )}
              <button
                type="button"
                className={`${styles.ghostBtn} ${excluded ? styles.ghostBtnOn : ""}`}
                onClick={() => toggleExcludedTitle(mediaType, id)}
                title="Ne plus proposer ce titre dans les suggestions"
              >
                {excluded ? "Titre exclu — réintégrer" : "Exclure ce titre"}
              </button>
            </div>

            {watched && (
              <RatingStars
                value={getRating(mediaType, id)}
                onRate={(r) => rateWatched(mediaType, id, r)}
              />
            )}
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <h2>Où regarder{regionName ? ` · ${regionName}` : ""}</h2>
        <ProviderBadges providers={providers} />
      </section>

      {mediaType === "tv" && details.seasons && details.seasons.length > 0 && (
        <EpisodeTracker item={libItem} seasons={details.seasons} />
      )}

      {(directors.length > 0 || cast.length > 0) && (
        <section className={styles.section}>
          {directors.length > 0 && (
            <>
              <h3>{mediaType === "movie" ? "Réalisation" : "Créé par"}</h3>
              <div className={gridStyles.personGrid}>
                {directors.map((person) => (
                  <PersonCard
                    key={person.id}
                    id={person.id}
                    name={person.name}
                    profilePath={person.profilePath}
                    role={mediaType === "movie" ? "Réalisateur/Réalisatrice" : "Créateur/Créatrice"}
                  />
                ))}
              </div>
            </>
          )}

          {cast.length > 0 && (
            <>
              <h3 style={{ marginTop: 32 }}>Casting principal</h3>
              <div className={gridStyles.personGrid}>
                {visibleCast.map((member) => (
                  <PersonCard
                    key={member.credit_id || `${member.id}-${member.character}`}
                    id={member.id}
                    name={member.name}
                    profilePath={member.profile_path}
                    role={member.character}
                  />
                ))}
              </div>
              {remainingCastCount > 0 && (
                <div className={gridStyles.loadMore}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => setShowFullCast(true)}
                  >
                    Afficher tout le casting ({remainingCastCount} de plus)
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {mediaType === "movie" && details.belongs_to_collection && (
        <CollectionSection
          collectionId={details.belongs_to_collection.id}
          currentMovieId={Number(id)}
        />
      )}

      {recommendations.length > 0 && (
        <section className={styles.section} ref={recommendationsRef}>
          <h3>Si vous avez aimé « {title} »</h3>
          <div className={gridStyles.grid}>
            {recommendations.slice(0, 12).map((item) => (
              <MediaCard
                key={item.id}
                item={{ ...item, mediaType: item.media_type || mediaType }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
