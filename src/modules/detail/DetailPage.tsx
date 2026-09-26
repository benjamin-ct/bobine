import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  backdropUrl,
  posterUrl,
  getDetails,
  watchProvidersFromDetails,
  estimateRuntimeMinutes,
  getTheatricalDateFromDetails,
  theatricalStatusFromDate,
  getSeriesEpisodeBadge,
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
  Icon,
} from "../../shared/components/index.ts";
import EpisodeTracker from "./components/EpisodeTracker.tsx";
import CollectionSection from "./components/CollectionSection.tsx";
import DetailSkeleton from "./components/DetailSkeleton.tsx";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import { regionName as countryDisplayName, useRegion } from "../../core/context/RegionContext.tsx";
import { useLocale } from "../../core/context/LocaleContext.tsx";
import { useExcludedGenres } from "../../core/context/ExcludedGenresContext.tsx";
import { useExcludedTitles } from "../../core/context/ExcludedTitlesContext.tsx";
import { useMembersOnly } from "../../core/context/MembersOnlyContext.tsx";
import { posterAccentFromGenres } from "../../shared/lib/posterAccent.ts";
import { ratingTier } from "../../shared/lib/ratingTier.ts";
import { getMediaPreview, type MediaPreview } from "../../shared/lib/mediaPreviewCache.ts";
import posterStyles from "../../shared/styles/posterAccents.module.css";
import dropdownStyles from "../../shared/components/Dropdown/Dropdown.module.css";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import type { MediaDetails, MediaType } from "../../core/types/tmdb.ts";
import styles from "./DetailPage.module.css";

const MAIN_CAST_COUNT = 12;

export default function DetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mediaType, id } = useParams<{ mediaType: MediaType; id: string }>();
  const [details, setDetails] = useState<MediaDetails | null>(null);
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
  const { locale } = useLocale();
  const { excludedGenreIds } = useExcludedGenres();
  const { isExcludedTitle, toggleExcludedTitle } = useExcludedTitles();
  const { requireMember } = useMembersOnly();
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
    // `region` n'affecte pas la requête (getDetails renvoie déjà toutes les
    // régions dans `watch/providers`/`release_dates`) : les valeurs dérivées
    // de la région (providers, date ciné) sont recalculées à chaque rendu
    // plus bas, sans redéclencher ce fetch ni l'état "loading" — sinon un
    // changement de région (ex. détection async après le rendu initial en
    // région par défaut) provoquait un flash complet de la fiche (skeleton +
    // affiche qui semble ne se rafraîchir qu'au reload).
  }, [mediaType, id]);

  // Saute directement aux titres similaires si on arrive via le bouton "🔁".
  useEffect(() => {
    if (status === "success" && window.location.hash === "#recommendations") {
      recommendationsRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [status]);

  if (!mediaType || !id) {
    return null;
  }

  const backLink = (
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
      {t("detailPage.back")}
    </Link>
  );

  if (status === "loading") {
    return (
      <div className={styles.page}>
        {backLink}
        <DetailSkeleton mediaType={mediaType} id={id} preview={preview} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={styles.page}>
        {backLink}
        <ErrorMessage error={error} />
      </div>
    );
  }
  if (!details) {
    return null;
  }

  const title = details.title || details.name || t("common.unknownTitle");
  const date = details.release_date || details.first_air_date;
  const providers = watchProvidersFromDetails(details, region);
  const runtime = details.runtime || details.episode_run_time?.[0];
  const watched = isWatched(mediaType, id);
  const inWatchlist = isInWatchlist(mediaType, id);
  const excluded = isExcludedTitle(mediaType, id);
  const accentKey = posterAccentFromGenres(
    details.genres?.map((g) => g.id),
    `${mediaType}:${id}`
  );

  const theatricalDate =
    mediaType === "movie" ? getTheatricalDateFromDetails(details, region) : null;
  // La date à côté du titre doit suivre la même source que le badge "au
  // cinéma" juste en dessous : `details.release_date` est une date globale
  // TMDB indépendante de la région, alors que `theatricalDate` est la sortie
  // ciné réelle dans la région active — sans ça les deux affichaient des
  // dates différentes pour un même film selon la région du visiteur.
  const displayDate = theatricalDate || date;
  const theatricalStatus = theatricalStatusFromDate(theatricalDate);
  const theatricalDateFormatted = theatricalDate ? formatFullDate(theatricalDate, locale) : null;
  const theatricalMessage = theatricalStatus
    ? {
        in_theaters: t("detailPage.inTheatersNow", { date: theatricalDateFormatted }),
        upcoming: t("detailPage.upcomingTheatrical", { date: theatricalDateFormatted }),
        past: t("detailPage.pastTheatrical", { date: theatricalDateFormatted }),
      }[theatricalStatus]
    : null;

  const episodeBadge = mediaType === "tv" ? getSeriesEpisodeBadge(details) : null;
  const episodeBadgeDateFormatted = episodeBadge
    ? formatFullDate(episodeBadge.date, locale) || episodeBadge.date
    : null;
  const episodeBadgeMessage = episodeBadge
    ? episodeBadge.kind === "just_released"
      ? t("detailPage.episodeJustReleased", { date: episodeBadgeDateFormatted })
      : t("detailPage.episodeUpcoming", { date: episodeBadgeDateFormatted })
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
      addToList(listId, libItem);
      setNewListName("");
    }
  }

  const tier = details.vote_average != null ? ratingTier(details.vote_average) : null;

  return (
    <div className={styles.page}>
      {backLink}

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
              {displayDate && (
                <span className={styles.year}>
                  ({formatFullDate(displayDate, locale) || displayDate.slice(0, 4)})
                </span>
              )}
            </h1>
            <p className={styles.meta}>
              {details.genres?.map((g) => g.name).join(" · ")}
              {mediaType === "tv" && details.number_of_seasons
                ? ` · ${t("detailPage.seasonsCount", { count: details.number_of_seasons })}`
                : ""}
              {mediaType === "tv" && details.number_of_episodes
                ? ` · ${t("detailPage.episodesCount", { count: details.number_of_episodes })}`
                : ""}
              {runtime
                ? ` · ${t("detailPage.runtimeMinutes", { count: runtime })}${mediaType === "tv" ? t("detailPage.perEpisodeSuffix") : ""}`
                : ""}
              {details.production_countries && details.production_countries.length > 0
                ? ` · ${details.production_countries
                    .map((c) => countryDisplayName(c.iso_3166_1, locale) || c.name)
                    .join(", ")}`
                : ""}
              {details.vote_average && tier ? (
                <span
                  className={`${styles.score} ${styles[`s-${tier.cls}`]}`}
                  title={
                    details.vote_count
                      ? t("detailPage.votesCount", {
                          count: details.vote_count,
                          formattedCount: details.vote_count.toLocaleString("fr-FR"),
                        })
                      : undefined
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" />
                  </svg>
                  {details.vote_average.toFixed(1)}
                </span>
              ) : null}
            </p>
            {theatricalMessage && (
              <p className={styles.statusPill}>
                <Icon name={theatricalStatus === "upcoming" ? "calendar" : "film"} />{" "}
                {theatricalMessage}
              </p>
            )}
            {episodeBadgeMessage && (
              <p className={styles.statusPill}>
                <Icon name={episodeBadge?.kind === "just_released" ? "sparkle" : "calendar"} />{" "}
                {episodeBadgeMessage}
              </p>
            )}
            <p className={styles.overview}>{details.overview || t("detailPage.noOverview")}</p>

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.actionBtn} ${watched ? styles.actionBtnOn : ""}`}
                onClick={() => toggleWatched(libItem)}
                aria-pressed={watched}
              >
                <Icon name="check" strokeWidth={watched ? 3 : 2} />
                {watched ? t("detailPage.watchedOn") : t("detailPage.watchedOff")}
              </button>
              <button
                type="button"
                className={`${styles.actionBtnSecondary} ${inWatchlist ? styles.actionBtnSecondaryOn : ""}`}
                onClick={() => toggleWatchlist(libItem)}
                aria-pressed={inWatchlist}
              >
                <Icon name="star" filled={inWatchlist} />
                {inWatchlist ? t("detailPage.wantToWatchOn") : t("detailPage.wantToWatchOff")}
              </button>
              <TrailerButton videos={details.videos?.results} />
              <Dropdown
                label={t("detailPage.addTo")}
                pill
                active={customLists.some((list) => isInList(list.id, mediaType, id))}
              >
                <div className={dropdownStyles.head}>{t("detailPage.addToListHeading")}</div>
                {customLists.length === 0 && (
                  <p className={styles.emptyHint}>{t("detailPage.noListsYet")}</p>
                )}
                {customLists.map((list) => {
                  const on = isInList(list.id, mediaType, id);
                  return (
                    <button
                      key={list.id}
                      type="button"
                      className={`${dropdownStyles.option} ${on ? dropdownStyles.optionOn : ""}`}
                      onClick={() =>
                        on ? removeFromList(list.id, mediaType, id) : addToList(list.id, libItem)
                      }
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
                    placeholder={t("detailPage.createListPlaceholder")}
                    maxLength={40}
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNewList()}
                  />
                  <button type="button" onClick={submitNewList}>
                    {t("detailPage.create")}
                  </button>
                </div>
              </Dropdown>
              {recommendations.length > 0 && (
                <button type="button" className={styles.ghostBtn} onClick={scrollToRecommendations}>
                  <Icon name="repeat" />
                  {t("detailPage.similar")}
                </button>
              )}
              <button
                type="button"
                className={`${styles.ghostBtn} ${excluded ? styles.ghostBtnOn : ""}`}
                // Écrit dans le compte comme les actions de la bibliothèque :
                // réservé aux membres connectés (voir MembersOnlyContext).
                onClick={() =>
                  requireMember() &&
                  toggleExcludedTitle(
                    mediaType,
                    id,
                    date ? `${title} (${date.slice(0, 4)})` : title
                  )
                }
                title={t("detailPage.excludeTitleHint")}
              >
                {excluded ? t("detailPage.excludedReinclude") : t("detailPage.excludeTitle")}
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
        <h2>
          {t("detailPage.whereToWatch")}
          {regionName ? ` · ${regionName}` : ""}
        </h2>
        <ProviderBadges providers={providers} regionName={regionName} />
      </section>

      {mediaType === "tv" && details.seasons && details.seasons.length > 0 && (
        <EpisodeTracker item={libItem} seasons={details.seasons} />
      )}

      {(directors.length > 0 || cast.length > 0) && (
        <section className={styles.section}>
          {directors.length > 0 && (
            <>
              <h3>
                {mediaType === "movie" ? t("detailPage.directing") : t("detailPage.createdBy")}
              </h3>
              <div className={gridStyles.personGrid}>
                {directors.map((person) => (
                  <PersonCard
                    key={person.id}
                    id={person.id}
                    name={person.name}
                    profilePath={person.profilePath}
                    role={
                      mediaType === "movie"
                        ? t("detailPage.directorRole")
                        : t("detailPage.creatorRole")
                    }
                  />
                ))}
              </div>
            </>
          )}

          {cast.length > 0 && (
            <>
              <h3 style={{ marginTop: 32 }}>{t("detailPage.mainCast")}</h3>
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
                    {t("detailPage.showFullCast", { count: remainingCastCount })}
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
          <h3>{t("detailPage.ifYouLiked", { title })}</h3>
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
