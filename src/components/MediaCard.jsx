import { useEffect, useRef, useState } from "react";
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
} from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";
import { useRegion } from "../context/RegionContext";

const THEATRICAL_BADGES = {
  in_theaters: "🎬 En salles",
  upcoming: "🗓️ Bientôt au cinéma",
};

// `showProviderBadge` : opt-in, seule Nouveautés l'active (contenus déjà
// sortis — voir showFutureReleaseBadge ci-dessous pour Prochainement).
// Contrairement à la pastille théâtrale (indexée une fois pour toute la
// grille, voir getTheatricalStatusIndex), TMDB n'a pas d'équivalent en
// masse pour "quelles plateformes pour ces N titres" — un appel par carte
// est ici incontournable. Le scope opt-in limite où ce coût est payé ; le
// cache mémoire de getWatchProviders() et le cache d'edge du proxy TMDB
// (voir worker/index.js) atténuent le reste.
//
// `showFutureReleaseBadge` : opt-in, seule Prochainement l'active. Tout y
// est par définition pas encore sorti, donc le badge doit dire OÙ/COMMENT
// la sortie à venir est prévue (Cinéma, Netflix, Prime Video, ABC, "Série
// à venir"...) — jamais déduit de /watch/providers (disponibilité
// actuelle, pas sortie annoncée : voir getUpcomingMovieRelease /
// getUpcomingSeriesRelease dans tmdb.js). Réutilise le même badge
// (`.media-card__theatrical`, même position/style) que showProviderBadge,
// juste avec un texte calculé différemment.
export default function MediaCard({
  item,
  showProviderBadge = false,
  showFutureReleaseBadge = false,
}) {
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useLibrary();
  const { getTheatricalStatus, region } = useRegion();
  const mediaType = item.mediaType || item.media_type;
  const title = item.title || item.name;
  const date = item.release_date || item.first_air_date;
  const watched = isWatched(mediaType, item.id);
  const inWatchlist = isInWatchlist(mediaType, item.id);

  // Statut "au cinéma" (France) : uniquement pour les films (les séries
  // n'ont pas de notion de sortie en salle). L'appartenance à l'index
  // (now_playing/upcoming, voir getTheatricalStatusIndex dans tmdb.js) dit
  // seulement "ce film a une distribution en salle" — TMDB inclut dans
  // now_playing une fenêtre qui peut déborder sur des sorties très proches
  // mais pas encore effectives (avant-premières...), donc le libellé final
  // ("En salles" vs "Bientôt") est tranché par la vraie date de sortie,
  // pas par la seule présence dans l'une ou l'autre liste — sinon un film
  // pas encore sorti peut afficher "En salles" à tort.
  const inTheatricalIndex = mediaType === "movie" ? getTheatricalStatus(item.id) : null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const theatricalStatus =
    inTheatricalIndex && date ? (date <= todayIso ? "in_theaters" : "upcoming") : inTheatricalIndex;

  // Charger le badge (plateforme ou prochaine sortie) seulement quand la
  // carte approche du viewport (comme le poster, déjà en loading="lazy") :
  // une grille de Nouveautés/Prochainement affiche ~20 cartes d'un coup,
  // et sans ça les ~20 appels par carte (IDs tous différents — pas
  // d'endpoint en masse côté TMDB pour ni l'un ni l'autre badge) partent
  // tous en parallèle dès le montage, y compris pour les cartes hors
  // écran. Ce pic simultané, multiplié par plusieurs visiteurs en même
  // temps, épuise le quota de la clé TMDB partagée (429 observés en
  // prod). Observer seulement le poster limite le nombre de requêtes
  // lancées à ce qui est réellement visible (ou sur le point de l'être).
  const posterRef = useRef(null);
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

  const [provider, setProvider] = useState(null);
  // Distingue "pas encore vérifié" de "vérifié, rien trouvé" : sans ça,
  // impossible de savoir si l'absence de badge plateforme est un vrai
  // "on ne sait pas encore où" ou juste le fetch pas encore résolu.
  const [providerStatus, setProviderStatus] = useState("idle");
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
  // est ambigu pour qui regarde la carte : impossible de deviner si "pas
  // de badge" veut dire "sort en streaming direct, pas encore listé chez
  // TMDB" ou "va sortir au cinéma mais hors de la fenêtre now_playing/
  // upcoming indexée". On le dit explicitement plutôt que de laisser un
  // badge muet passer pour un oubli.
  const hasTheatricalBadge = Boolean(THEATRICAL_BADGES[theatricalStatus]);
  const showUnknownStatus =
    showProviderBadge && providerStatus === "done" && !provider && !hasTheatricalBadge;

  // Prochainement : prochaine sortie/diffusion connue (label + date),
  // films (release_dates, région courante) et séries (networks[].name)
  // traités séparément — voir tmdb.js pour le détail de chaque logique.
  // `null` tant que non résolu ; `undefined` n'est jamais utilisé pour
  // pouvoir distinguer "pas encore chargé" de "chargé, rien trouvé" via
  // `upcomingStatus`.
  const [upcomingRelease, setUpcomingRelease] = useState(null);
  const [upcomingStatus, setUpcomingStatus] = useState("idle");
  useEffect(() => {
    if (!showFutureReleaseBadge || !isNearViewport) {
      return;
    }
    let cancelled = false;
    setUpcomingStatus("loading");
    const fetchUpcoming =
      mediaType === "movie"
        ? getMovieReleaseDates(item.id).then((data) => getUpcomingMovieRelease(data, region, date))
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

  // Film sans note/type exploitable dans release_dates (rare, mais arrive
  // si aucune date française n'est encore annoncée précisément) : on
  // retombe sur l'index théâtral déjà chargé pour toute la grille (voir
  // plus haut, aucun coût réseau supplémentaire) plutôt que de laisser le
  // badge vide. Vocabulaire unifié avec le reste de Prochainement : même
  // ce repli affiche "Cinéma", pas "🗓️ Bientôt au cinéma". Gardé derrière
  // `upcomingStatus === "done"` pour ne pas afficher "Cinéma" puis le
  // remplacer par un libellé plus précis une fois release_dates résolu.
  const futureReleaseLabel =
    upcomingRelease?.label ||
    (mediaType === "movie" && theatricalStatus === "upcoming" && upcomingStatus === "done"
      ? "Cinéma"
      : null);
  // La date affichée doit correspondre à la sortie utilisée pour calculer
  // le badge (une série/un film peut avoir plusieurs dates régionales
  // différentes de sa date "primaire" utilisée par la liste Découvrir).
  const effectiveDate = (showFutureReleaseBadge && upcomingRelease?.date) || date;
  const displayDate =
    formatFullDate(effectiveDate) || (effectiveDate ? effectiveDate.slice(0, 4) : "—");

  const libItem = {
    id: item.id,
    mediaType,
    title,
    posterPath: item.poster_path,
    date,
    genreIds: item.genre_ids || [],
  };

  return (
    <div className="media-card">
      <Link to={`/media/${mediaType}/${item.id}`} className="media-card__link">
        <div className="media-card__poster" ref={posterRef}>
          {item.poster_path ? (
            <img src={posterUrl(item.poster_path)} alt={title} loading="lazy" />
          ) : (
            <div className="media-card__no-poster">{title}</div>
          )}
          {watched && <span className="badge badge--watched">✔ Vu</span>}
          <span className="media-card__type">{mediaType === "movie" ? "Film" : "Série"}</span>
          {showFutureReleaseBadge ? (
            futureReleaseLabel && (
              <span className="media-card__theatrical" title={futureReleaseLabel}>
                {futureReleaseLabel}
              </span>
            )
          ) : (
            <>
              {hasTheatricalBadge && (
                <span className="media-card__theatrical">
                  {THEATRICAL_BADGES[theatricalStatus]}
                </span>
              )}
              {showUnknownStatus && (
                <span className="media-card__theatrical media-card__theatrical--unknown">
                  ❔ Diffusion pas encore annoncée
                </span>
              )}
              {provider?.logo_path && (
                <span className="media-card__provider" title={provider.provider_name}>
                  <img src={logoUrl(provider.logo_path, "w45")} alt={provider.provider_name} />
                </span>
              )}
            </>
          )}
        </div>
        <div className="media-card__info">
          <p className="media-card__title" title={title}>
            {title}
          </p>
          <p className="media-card__year">{displayDate}</p>
        </div>
      </Link>
      <div className="media-card__actions">
        <button
          className={`icon-btn ${inWatchlist ? "icon-btn--gold" : ""}`}
          onClick={() => toggleWatchlist(libItem)}
          title="Envie de voir"
        >
          {inWatchlist ? "★ Envie de voir" : "☆ Envie de voir"}
        </button>
        <button
          className={`icon-btn ${watched ? "icon-btn--green" : ""}`}
          onClick={() => toggleWatched(libItem)}
          title="Marquer comme vu"
        >
          {watched ? "✔ Vu" : "○ Vu"}
        </button>
      </div>
    </div>
  );
}
