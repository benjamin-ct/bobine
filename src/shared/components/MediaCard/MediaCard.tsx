import { memo, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  posterUrl,
  logoUrl,
  getWatchProviders,
  getDetails,
  getMovieReleaseDates,
  getUpcomingMovieRelease,
  getUpcomingSeriesRelease,
  formatFullDate,
} from "../../../core/api/tmdb.ts";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { useRegion } from "../../../core/context/RegionContext.tsx";
import { posterAccentFromGenres } from "../../lib/posterAccent.ts";
import type {
  MediaItem,
  ReleaseDatesResponse,
  WatchProviderEntry,
} from "../../../core/types/tmdb.ts";
import posterStyles from "../../styles/posterAccents.module.css";
import styles from "./MediaCard.module.css";

const THEATRICAL_BADGES: Record<string, string> = {
  in_theaters: "🎬 En salles",
  upcoming: "🗓️ Bientôt au cinéma",
};

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
}

// `memo` : les grilles (Découvrir, Nouveautés, Ma liste...) affichent des
// dizaines de cartes dont les props (`item`) restent stables d'un rendu à
// l'autre — évite de re-rendre toute la grille quand seul un état non lié
// au grid change dans le composant parent (ouverture d'un filtre...).
function MediaCard({
  item,
  showProviderBadge = false,
  showFutureReleaseBadge = false,
}: MediaCardProps) {
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useLibrary();
  const { getTheatricalStatus, region } = useRegion();
  const mediaType = item.mediaType;
  const title = item.title || item.name || "Titre inconnu";
  const date = item.release_date || item.first_air_date;
  const watched = isWatched(mediaType, item.id);
  const inWatchlist = isInWatchlist(mediaType, item.id);

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
    if (!showProviderBadge && !showFutureReleaseBadge) {
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
  }, [showProviderBadge, showFutureReleaseBadge]);

  const [provider, setProvider] = useState<WatchProviderEntry | null>(null);
  // Distingue "pas encore vérifié" de "vérifié, rien trouvé".
  const [providerStatus, setProviderStatus] = useState<"idle" | "loading" | "done">("idle");
  useEffect(() => {
    if (!showProviderBadge || !isNearViewport) {
      return;
    }
    let cancelled = false;
    setProviderStatus("loading");
    getWatchProviders(mediaType, item.id, region)
      .then((data) => {
        if (cancelled) {
          return;
        }
        // Abonnement en priorité (le plus pertinent pour "où le regarder"),
        // sinon location/achat ; rien si le titre n'est encore distribué
        // nulle part (fréquent sur Prochainement) — pas de badge affiché.
        setProvider(data?.flatrate?.[0] || data?.rent?.[0] || data?.buy?.[0] || null);
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
  }, [showProviderBadge, isNearViewport, mediaType, item.id, region]);

  // Sur Nouveautés, un titre sans badge cinéma ET sans plateforme connue
  // est ambigu : on le dit explicitement plutôt que de laisser un badge
  // muet passer pour un oubli.
  const hasTheatricalBadge = Boolean(theatricalStatus && THEATRICAL_BADGES[theatricalStatus]);
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

  // Film sans date exploitable dans release_dates : on retombe sur l'index
  // théâtral déjà chargé pour toute la grille plutôt que de laisser le
  // badge vide. Vocabulaire unifié : même ce repli affiche "Cinéma".
  const futureReleaseLabel =
    upcomingRelease?.label ||
    (mediaType === "movie" && theatricalStatus === "upcoming" && upcomingStatus === "done"
      ? "Cinéma"
      : null);
  const effectiveDate = (showFutureReleaseBadge && upcomingRelease?.date) || date;
  const displayDate =
    formatFullDate(effectiveDate) || (effectiveDate ? effectiveDate.slice(0, 4) : "—");

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
          {watched && <span className={styles.badgeWatched}>✔ Vu</span>}
          <span className={styles.type}>{mediaType === "movie" ? "Film" : "Série"}</span>
          {showFutureReleaseBadge ? (
            futureReleaseLabel && (
              <span className={styles.theatrical} title={futureReleaseLabel}>
                {futureReleaseLabel}
              </span>
            )
          ) : (
            <>
              {hasTheatricalBadge && theatricalStatus && (
                <span className={styles.theatrical}>{THEATRICAL_BADGES[theatricalStatus]}</span>
              )}
              {showUnknownStatus && (
                <span className={`${styles.theatrical} ${styles.theatricalUnknown}`}>
                  ❔ Diffusion pas encore annoncée
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
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.actionBtn} ${inWatchlist ? styles.actionBtnGold : ""}`}
          onClick={() => toggleWatchlist(libItem)}
          aria-pressed={inWatchlist}
          title="Envie de voir"
        >
          {inWatchlist ? "★ Envie de voir" : "☆ Envie de voir"}
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${watched ? styles.actionBtnGreen : ""}`}
          onClick={() => toggleWatched(libItem)}
          aria-pressed={watched}
          title="Marquer comme vu"
        >
          {watched ? "✔ Vu" : "○ Vu"}
        </button>
      </div>
    </div>
  );
}

export default memo(MediaCard);
