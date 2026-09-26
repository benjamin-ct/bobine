import { memo, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  posterUrl,
  logoUrl,
  getWatchProviders,
  getDetails,
  getMovieReleaseDates,
  getUpcomingMovieRelease,
  getUpcomingSeriesRelease,
  getSeriesEpisodeBadge,
  formatFullDate,
} from "../../../core/api/tmdb.ts";
import type { SeriesEpisodeBadge } from "../../../core/api/tmdb.ts";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { useRegion } from "../../../core/context/RegionContext.tsx";
import { useLocale } from "../../../core/context/LocaleContext.tsx";
import { posterAccentFromGenres } from "../../lib/posterAccent.ts";
import { setMediaPreview } from "../../lib/mediaPreviewCache.ts";
import type {
  MediaItem,
  RegionWatchProviders,
  ReleaseDatesResponse,
  WatchProviderEntry,
} from "../../../core/types/tmdb.ts";
import Icon, { type IconName } from "../Icon/Icon.tsx";
import posterStyles from "../../styles/posterAccents.module.css";
import styles from "./MediaCard.module.css";

interface MediaCardProps {
  item: MediaItem;
  /** Opt-in, seule Nouveautés l'active (contenus déjà sortis — voir
   * showFutureReleaseBadge ci-dessous pour Prochainement). Contrairement à
   * la pastille théâtrale (indexée une fois pour toute la grille, voir
   * getTheatricalStatusIndex), TMDB n'a pas d'équivalent en masse pour
   * "quelles plateformes pour ces N titres" — un appel par carte est ici
   * incontournable. Le scope opt-in limite où ce coût est payé. */
  showProviderBadge?: boolean;
  /** Opt-in, seule Prochainement l'active. Tout y est par définition pas
   * encore sorti : le badge doit dire OÙ/COMMENT la sortie à venir est
   * prévue, jamais déduit de /watch/providers. Réutilise le même badge
   * (.theatrical, même position/style) que showProviderBadge. */
  showFutureReleaseBadge?: boolean;
  /** Opt-in, séries uniquement (voir seriesEpisodeBadge.ts) : "Vient de
   * sortir"/"Prochainement" sur un épisode, indépendant des deux badges
   * ci-dessus (sortie ciné/plateforme, propre aux films). Même emplacement
   * visuel (.theatrical). */
  showEpisodeBadge?: boolean;
  /** Opt-in, seul le Top 5 du profil partagé l'utilise : rang affiché en
   * médaillon en haut à gauche de l'affiche (le badge Film/Série se décale
   * à sa droite). */
  rank?: number;
}

// `memo` : les grilles (Découvrir, Nouveautés, Ma liste...) affichent des
// dizaines de cartes dont les props (`item`) restent stables d'un rendu à
// l'autre — évite de re-rendre toute la grille quand seul un état non lié
// au grid change dans le composant parent (ouverture d'un filtre...).
function MediaCard({
  item,
  showProviderBadge = false,
  showFutureReleaseBadge = false,
  showEpisodeBadge = false,
  rank,
}: MediaCardProps) {
  const { t } = useTranslation();
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useLibrary();
  const { getTheatricalStatus, region } = useRegion();
  const { locale } = useLocale();
  const theatricalBadges: Record<string, string> = {
    in_theaters: t("mediaCard.inTheaters"),
    upcoming: t("mediaCard.upcomingTheatrical"),
  };
  const theatricalIcons: Record<string, IconName> = { in_theaters: "film", upcoming: "calendar" };
  const mediaType = item.mediaType;
  const title = item.title || item.name || t("common.unknownTitle");
  // item.region_release_date (résolu côté Worker, voir discover() avec
  // includeRegionReleaseDate) est la date de sortie ciné région-consciente ;
  // item.release_date est la date "primaire" globale de TMDB, pas fiable
  // pour la région active (voir worker/index.ts,
  // enrichDiscoverResultsWithRegionDate). `null` (enrichi, rien trouvé pour
  // cette région) retombe correctement sur item.release_date via `||`.
  const date = item.region_release_date || item.release_date || item.first_air_date;
  const watched = isWatched(mediaType, item.id);
  const inWatchlist = isInWatchlist(mediaType, item.id);

  // Alimente le cache de préview (voir mediaPreviewCache) pour que la fiche
  // (DetailPage) puisse préafficher affiche/titre/date pendant son propre
  // chargement, plutôt qu'un écran vide — ce sont les mêmes infos que
  // celles déjà affichées ici.
  useEffect(() => {
    setMediaPreview(mediaType, item.id, { title, posterPath: item.poster_path ?? null, date });
  }, [mediaType, item.id, title, item.poster_path, date]);

  // Statut "au cinéma" (France) : uniquement pour les films (les séries
  // n'ont pas de notion de sortie en salle). L'appartenance à l'index
  // (now_playing/upcoming) dit seulement "ce film a une distribution en
  // salle" — TMDB inclut dans now_playing une fenêtre qui peut déborder
  // sur des sorties très proches mais pas encore effectives, donc le
  // libellé final est tranché par la vraie date de sortie.
  const inTheatricalIndex = mediaType === "movie" ? getTheatricalStatus(item.id) : null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const theatricalStatus =
    inTheatricalIndex && date ? (date <= todayIso ? "in_theaters" : "upcoming") : inTheatricalIndex;

  // Charger le badge (plateforme ou prochaine sortie) seulement quand la
  // carte approche du viewport : une grille de Nouveautés/Prochainement
  // affiche ~20 cartes d'un coup, et sans ça les ~20 appels par carte
  // partent tous en parallèle dès le montage, y compris pour les cartes
  // hors écran — pic qui épuise le quota de la clé TMDB partagée.
  const posterRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  useEffect(() => {
    if (!showProviderBadge && !showFutureReleaseBadge && !showEpisodeBadge) {
      return;
    }
    const el = posterRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showProviderBadge, showFutureReleaseBadge, showEpisodeBadge]);

  const [provider, setProvider] = useState<WatchProviderEntry | null>(null);
  // Distingue "pas encore vérifié" de "vérifié, rien trouvé".
  const [providerStatus, setProviderStatus] = useState<"idle" | "loading" | "done">("idle");
  useEffect(() => {
    if (!showProviderBadge || !isNearViewport) {
      return;
    }
    // Abonnement en priorité (le plus pertinent pour "où le regarder"),
    // sinon location/achat ; rien si le titre n'est encore distribué nulle
    // part (fréquent sur Prochainement) — pas de badge affiché.
    const pickBadge = (data: RegionWatchProviders | null | undefined) =>
      data?.flatrate?.[0] || data?.rent?.[0] || data?.buy?.[0] || null;
    // Déjà résolu côté Worker (discover() appelé avec includeProviderBadge,
    // voir NewReleasesPage) : `undefined` distingue "pas demandé" (fallback
    // ci-dessous) de "demandé, rien trouvé" (`null`), qui doit rester sans
    // appel réseau.
    if (item.watch_providers !== undefined) {
      setProvider(pickBadge(item.watch_providers));
      setProviderStatus("done");
      return;
    }
    let cancelled = false;
    setProviderStatus("loading");
    getWatchProviders(mediaType, item.id, region)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setProvider(pickBadge(data));
        setProviderStatus("done");
      })
      .catch(() => {
        if (!cancelled) {
          setProviderStatus("done");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showProviderBadge, isNearViewport, mediaType, item.id, item.watch_providers, region]);

  // Sur Nouveautés, un titre sans badge cinéma ET sans plateforme connue
  // est ambigu : on le dit explicitement plutôt que de laisser un badge
  // muet passer pour un oubli.
  const hasTheatricalBadge = Boolean(theatricalStatus && theatricalBadges[theatricalStatus]);
  const showUnknownStatus =
    showProviderBadge && providerStatus === "done" && !provider && !hasTheatricalBadge;

  // Prochainement : prochaine sortie/diffusion connue (label + date).
  const [upcomingRelease, setUpcomingRelease] = useState<{ label: string; date: string } | null>(
    null
  );
  const [upcomingStatus, setUpcomingStatus] = useState<"idle" | "loading" | "done">("idle");
  useEffect(() => {
    if (!showFutureReleaseBadge || !isNearViewport) {
      return;
    }
    let cancelled = false;
    setUpcomingStatus("loading");
    const fetchUpcoming =
      mediaType === "movie"
        ? getMovieReleaseDates(item.id).then((data) =>
            getUpcomingMovieRelease(data as ReleaseDatesResponse, region, date)
          )
        : getDetails("tv", item.id).then((data) => getUpcomingSeriesRelease(data));
    fetchUpcoming
      .then((result) => {
        if (cancelled) {
          return;
        }
        setUpcomingRelease(result);
        setUpcomingStatus("done");
      })
      .catch(() => {
        if (!cancelled) {
          setUpcomingStatus("done");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showFutureReleaseBadge, isNearViewport, mediaType, item.id, region, date]);

  // Vient de sortir / Prochainement (séries) : indépendant de
  // showFutureReleaseBadge (films uniquement), basé sur
  // next_episode_to_air/last_episode_to_air (voir seriesEpisodeBadge.ts).
  const [episodeBadge, setEpisodeBadge] = useState<SeriesEpisodeBadge | null>(null);
  useEffect(() => {
    if (!showEpisodeBadge || !isNearViewport || mediaType !== "tv") {
      return;
    }
    let cancelled = false;
    getDetails("tv", item.id)
      .then((details) => {
        if (!cancelled) {
          setEpisodeBadge(getSeriesEpisodeBadge(details));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEpisodeBadge(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showEpisodeBadge, isNearViewport, mediaType, item.id]);

  // Le texte affiché vient toujours de t() (kind -> clé de traduction),
  // jamais de episodeBadge.label (français en dur, présent uniquement pour
  // que la logique pure reste testable indépendamment de react-i18next).
  const episodeBadgeLabel = episodeBadge
    ? episodeBadge.kind === "just_released"
      ? t("mediaCard.episodeJustReleased")
      : t("mediaCard.episodeUpcoming")
    : null;
  const episodeBadgeDateFormatted = episodeBadge
    ? formatFullDate(episodeBadge.date, locale) || episodeBadge.date
    : null;

  // Film sans date exploitable dans release_dates : on retombe sur l'index
  // théâtral déjà chargé pour toute la grille plutôt que de laisser le
  // badge vide. Vocabulaire unifié : même ce repli affiche "Cinéma".
  const futureReleaseLabel =
    upcomingRelease?.label ||
    (mediaType === "movie" && theatricalStatus === "upcoming" && upcomingStatus === "done"
      ? t("mediaCard.upcomingFallback")
      : null);
  const effectiveDate = (showFutureReleaseBadge && upcomingRelease?.date) || date;
  const displayDate =
    formatFullDate(effectiveDate, locale) || (effectiveDate ? effectiveDate.slice(0, 4) : "—");

  const libItem = {
    id: item.id,
    mediaType,
    title,
    posterPath: item.poster_path ?? null,
    date,
    genreIds: item.genre_ids || [],
  };

  const accentKey = posterAccentFromGenres(item.genre_ids, `${mediaType}:${item.id}`);

  return (
    <div className={styles.card}>
      <Link to={`/media/${mediaType}/${item.id}`} className={styles.link}>
        <div className={styles.poster} ref={posterRef}>
          {item.poster_path ? (
            <img src={posterUrl(item.poster_path) ?? undefined} alt={title} loading="lazy" />
          ) : (
            <div className={`${styles.noPoster} ${posterStyles[accentKey]}`}>{title}</div>
          )}
          {rank != null && (
            <span
              className={`${styles.rank} ${rank <= 3 ? styles[`rank${rank}`] : ""}`}
              aria-label={t("mediaCard.rank", { rank })}
            >
              {rank}
            </span>
          )}
          <span className={styles.type}>
            {mediaType === "movie" ? t("mediaCard.movie") : t("mediaCard.series")}
          </span>
          {showEpisodeBadge ? (
            episodeBadgeLabel && (
              <span
                className={styles.theatrical}
                title={`${episodeBadgeLabel} (${episodeBadgeDateFormatted})`}
              >
                <Icon name={episodeBadge?.kind === "just_released" ? "sparkle" : "calendar"} />{" "}
                {episodeBadgeLabel}
              </span>
            )
          ) : showFutureReleaseBadge ? (
            futureReleaseLabel && (
              <span className={styles.theatrical} title={futureReleaseLabel}>
                <Icon name="calendar" /> {futureReleaseLabel}
              </span>
            )
          ) : (
            <>
              {hasTheatricalBadge && theatricalStatus && (
                <span className={styles.theatrical}>
                  <Icon name={theatricalIcons[theatricalStatus]} />{" "}
                  {theatricalBadges[theatricalStatus]}
                </span>
              )}
              {showUnknownStatus && (
                <span className={`${styles.theatrical} ${styles.theatricalUnknown}`}>
                  <Icon name="help" /> {t("mediaCard.unknownReleaseStatus")}
                </span>
              )}
              {provider?.logo_path && (
                <span className={styles.provider} title={provider.provider_name}>
                  <img
                    src={logoUrl(provider.logo_path, "w45") ?? undefined}
                    alt={provider.provider_name}
                  />
                </span>
              )}
            </>
          )}
        </div>
        <div className={styles.info}>
          <p className={styles.title} title={title}>
            {title}
          </p>
          <p className={styles.year}>{displayDate}</p>
        </div>
      </Link>
      {/* Pastilles Envie / Vu : toujours visibles, posées sur l'affiche mais
          hors du <Link> (pas de bouton imbriqué dans un lien). */}
      <div className={styles.pastilles}>
        <button
          type="button"
          className={`${styles.pastille} ${inWatchlist ? styles.pastilleWant : ""}`}
          onClick={() => toggleWatchlist(libItem)}
          aria-pressed={inWatchlist}
          aria-label={t("mediaCard.wantToWatch")}
          title={t("mediaCard.wantToWatch")}
        >
          <Icon name="star" size={18} strokeWidth={inWatchlist ? 2 : 1.5} filled={inWatchlist} />
        </button>
        <button
          type="button"
          className={`${styles.pastille} ${watched ? styles.pastilleWatched : ""}`}
          onClick={() => toggleWatched(libItem)}
          aria-pressed={watched}
          aria-label={t("mediaCard.markAsWatched")}
          title={t("mediaCard.markAsWatched")}
        >
          <Icon name="check" size={18} strokeWidth={watched ? 3 : 1.5} />
        </button>
      </div>
    </div>
  );
}

export default memo(MediaCard);
