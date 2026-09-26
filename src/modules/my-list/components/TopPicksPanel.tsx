import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { useRegion } from "../../../core/context/RegionContext.tsx";
import { searchMulti } from "../../../core/api/tmdb.ts";
import { posterUrl } from "../../../core/api/tmdbClient.ts";
import type { LibraryItem, LibraryItemInput } from "../../../core/types/library.ts";
import type { MediaType, SearchMultiResult } from "../../../core/types/tmdb.ts";
import styles from "./TopPicksPanel.module.css";

const MAX_PICKS = 5;

const keyOf = (item: { mediaType: string; id: number }) => `${item.mediaType}:${item.id}`;

// Seules les métadonnées d'affichage partent au Worker (voir sanitizeTopPicks).
const toPick = ({
  id,
  mediaType,
  title,
  posterPath,
  date,
}: LibraryItemInput): LibraryItemInput => ({
  id,
  mediaType,
  title,
  posterPath,
  date,
});

// Top 5 du profil partagé choisi à la main, façon « films favoris » de
// Letterboxd : parmi ses titres vus, ou n'importe quel titre du catalogue via
// la recherche de la modale. Sans choix, la page publique garde le calcul
// automatique (titres vus les mieux notés). Chaque modification est
// enregistrée tout de suite (PUT /api/account/top-picks).
//
// Sélection dans une modale (clic = ajouter/retirer), ordre par glisser-
// déposer. Le glisser passe par les Pointer Events plutôt que le drag & drop
// HTML5 : ce dernier ne fonctionne pas au doigt sur iOS/Android.
export default function TopPicksPanel() {
  const { t } = useTranslation();
  const { watched } = useLibrary();
  const [picks, setPicks] = useState<LibraryItemInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/top-picks")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: { topPicks?: LibraryItemInput[] }) => {
        if (!cancelled) {
          setPicks((data.topPicks ?? []).map(toPick));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPicks([]);
          setError(t("topPicks.loadError"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // L'item « vu » local, s'il existe, a l'affiche la plus à jour.
  const watchedByKey = useMemo(
    () => new Map(watched.map((item) => [keyOf(item), item])),
    [watched]
  );
  const byKey = new Map(
    (picks ?? []).map((pick) => [keyOf(pick), watchedByKey.get(keyOf(pick)) ?? pick])
  );
  const chosen = [...byKey.keys()];

  async function save(next: LibraryItemInput[]) {
    const previous = picks;
    setPicks(next);
    setError(null);
    try {
      const res = await fetch("/api/account/top-picks", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topPicks: next.map(toPick) }),
      });
      if (!res.ok) {
        throw new Error();
      }
    } catch {
      setPicks(previous);
      setError(t("topPicks.saveError"));
    }
  }

  const itemsOf = (keys: string[]) => keys.flatMap((key) => byKey.get(key) ?? []);

  function toggle(item: LibraryItemInput) {
    const key = keyOf(item);
    if (byKey.has(key)) {
      save(itemsOf(chosen.filter((k) => k !== key)));
    } else if (chosen.length < MAX_PICKS) {
      save([...itemsOf(chosen), item]);
    }
  }

  function onPointerDown(e: PointerEvent<HTMLLIElement>, key: string) {
    if (e.button !== 0 || chosen.length < 2) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragKey(key);
    setOverKey(key);
  }
  function onPointerMove(e: PointerEvent<HTMLLIElement>) {
    if (!dragKey) {
      return;
    }
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-pick-key]");
    if (target?.dataset.pickKey) {
      setOverKey(target.dataset.pickKey);
    }
  }
  function onPointerUp() {
    if (dragKey && overKey && dragKey !== overKey) {
      const next = chosen.filter((k) => k !== dragKey);
      next.splice(chosen.indexOf(overKey), 0, dragKey);
      save(itemsOf(next));
    }
    setDragKey(null);
    setOverKey(null);
  }

  if (picks === null) {
    return null;
  }

  const emptySlots = Array.from({ length: MAX_PICKS - chosen.length }, (_, i) => chosen.length + i);

  return (
    <section className={styles.panel} aria-labelledby="top-picks-title">
      <div className={styles.head}>
        <h2 id="top-picks-title" className={styles.title}>
          {t("topPicks.title")}
        </h2>
        <button type="button" className={styles.editBtn} onClick={() => setPickerOpen(true)}>
          {t(chosen.length ? "topPicks.edit" : "topPicks.choose")}
        </button>
      </div>
      <p className={styles.hint}>
        {t(
          chosen.length > 1
            ? "topPicks.hintDrag"
            : chosen.length
              ? "topPicks.hint"
              : "topPicks.hintEmpty"
        )}
      </p>

      <ol className={styles.slots}>
        {chosen.map((key, index) => {
          const item = byKey.get(key)!;
          const poster = posterUrl(item.posterPath, "w185");
          return (
            <li
              key={key}
              data-pick-key={key}
              className={`${styles.slot} ${chosen.length > 1 ? styles.draggable : ""} ${
                dragKey === key ? styles.dragging : ""
              } ${overKey === key && dragKey !== key ? styles.dropTarget : ""}`}
              onPointerDown={(e) => onPointerDown(e, key)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {poster ? (
                <img className={styles.poster} src={poster} alt="" draggable={false} />
              ) : (
                <span className={styles.noPoster}>{item.title}</span>
              )}
              <span className={`${styles.rank} ${index < 3 ? styles[`rank${index + 1}`] : ""}`}>
                {index + 1}
              </span>
              <button
                type="button"
                className={styles.remove}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => toggle(item)}
                aria-label={t("topPicks.removeTitle", { title: item.title })}
                title={t("topPicks.remove")}
              >
                ✕
              </button>
              <span className={styles.slotTitle}>{item.title}</span>
            </li>
          );
        })}
        {emptySlots.map((index) => (
          <li key={`empty-${index}`} className={styles.slot}>
            <button
              type="button"
              className={styles.emptySlot}
              onClick={() => setPickerOpen(true)}
              aria-label={t("topPicks.addAt", { rank: index + 1 })}
            >
              <span className={styles.emptyRank}>{index + 1}</span>
              <span className={styles.plus}>+</span>
            </button>
          </li>
        ))}
      </ol>

      {error && <p className={styles.errorHint}>{error}</p>}

      <TopPicksPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        watched={watched}
        chosen={chosen}
        onToggle={toggle}
      />
    </section>
  );
}

interface PickerProps {
  open: boolean;
  onClose: () => void;
  watched: LibraryItem[];
  chosen: string[];
  onToggle: (item: LibraryItemInput) => void;
}

type TypeFilter = "all" | MediaType;
const TYPE_FILTERS: TypeFilter[] = ["all", "movie", "tv"];
const CATALOG_MIN_QUERY = 2;
const CATALOG_DEBOUNCE_MS = 300;

type CatalogState =
  { status: "idle" | "loading" | "error" } | { status: "success"; items: LibraryItemInput[] };

// Modale de sélection : les titres vus (les notés d'abord, du mieux au moins
// bien noté), puis dès qu'on tape une recherche, les titres du catalogue TMDB
// pas encore vus. Un clic ajoute ou retire le titre ; la modale reste ouverte
// pour en choisir plusieurs d'affilée.
function TopPicksPicker({ open, onClose, watched, chosen, onToggle }: PickerProps) {
  const { t } = useTranslation();
  const { region } = useRegion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [catalog, setCatalog] = useState<CatalogState>({ status: "idle" });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      setQuery("");
      setTypeFilter("all");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const trimmed = query.trim();
  useEffect(() => {
    if (!open || trimmed.length < CATALOG_MIN_QUERY) {
      setCatalog({ status: "idle" });
      return;
    }
    let cancelled = false;
    setCatalog({ status: "loading" });
    const timeoutId = setTimeout(() => {
      searchMulti(trimmed, 1, region)
        .then((data) => {
          if (!cancelled) {
            setCatalog({ status: "success", items: searchResultsToItems(data.results || []) });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCatalog({ status: "error" });
          }
        });
    }, CATALOG_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [open, trimmed, region]);

  const matchesType = (item: { mediaType: MediaType }) =>
    typeFilter === "all" || item.mediaType === typeFilter;

  const seenCandidates = useMemo(() => {
    const q = trimmed.toLocaleLowerCase();
    return watched
      .filter((item) => !q || item.title.toLocaleLowerCase().includes(q))
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }, [watched, trimmed]).filter(matchesType);

  const watchedKeys = useMemo(() => new Set(watched.map(keyOf)), [watched]);
  const catalogCandidates =
    catalog.status === "success"
      ? catalog.items.filter((item) => !watchedKeys.has(keyOf(item)) && matchesType(item))
      : [];

  const free = MAX_PICKS - chosen.length;
  const searching = trimmed.length >= CATALOG_MIN_QUERY;

  function renderGrid(items: (LibraryItemInput & { rating?: number | null })[]) {
    return (
      <ul className={styles.grid}>
        {items.map((item) => {
          const key = keyOf(item);
          const rank = chosen.indexOf(key) + 1;
          const poster = posterUrl(item.posterPath, "w185");
          const year = item.date?.slice(0, 4);
          return (
            <li key={key}>
              <button
                type="button"
                className={`${styles.candidate} ${rank ? styles.selected : ""}`}
                onClick={() => onToggle(item)}
                disabled={!rank && free === 0}
                aria-pressed={rank > 0}
              >
                <span className={styles.candidatePoster}>
                  {poster ? (
                    <img className={styles.poster} src={poster} alt="" loading="lazy" />
                  ) : (
                    <span className={styles.noPoster}>{item.title}</span>
                  )}
                  <span className={styles.typeBadge}>
                    {t(item.mediaType === "tv" ? "mediaCard.series" : "mediaCard.movie")}
                  </span>
                  {item.rating != null && <span className={styles.rating}>★ {item.rating}</span>}
                  {rank > 0 && (
                    <span className={styles.inTop}>
                      <span className={`${styles.inTopRank} ${styles[`inTopRank${rank}`] ?? ""}`}>
                        {rank}
                      </span>
                      <span className={styles.inTopLabel}>{t("topPicks.inTop")}</span>
                    </span>
                  )}
                </span>
                <span className={styles.candidateTitle}>{item.title}</span>
                {year && <span className={styles.candidateYear}>{year}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="top-picks-picker-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {open && (
        <div className={styles.dialogContent}>
          <div className={styles.dialogHead}>
            <div>
              <h2 id="top-picks-picker-title" className={styles.dialogTitle}>
                {t("topPicks.pickerTitle")}
              </h2>
              <p className={styles.dialogSubtitle}>
                {free === 0 ? t("topPicks.full") : t("topPicks.freeSlots", { count: free })}
              </p>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label={t("topPicks.close")}
            >
              ✕
            </button>
          </div>
          <input
            className={styles.search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("topPicks.searchPlaceholder")}
            aria-label={t("topPicks.searchLabel")}
          />
          <div className={styles.typeTabs} role="group" aria-label={t("topPicks.typeFilter")}>
            {TYPE_FILTERS.map((type) => (
              <button
                key={type}
                type="button"
                className={`${styles.typeTab} ${typeFilter === type ? styles.typeTabActive : ""}`}
                onClick={() => setTypeFilter(type)}
                aria-pressed={typeFilter === type}
              >
                {t(`topPicks.type.${type}`)}
              </button>
            ))}
          </div>
          <div className={styles.results}>
            {seenCandidates.length > 0 && (
              <>
                <h3 className={styles.sectionTitle}>{t("topPicks.seenSection")}</h3>
                {renderGrid(seenCandidates)}
              </>
            )}
            {searching && (
              <>
                <h3 className={styles.sectionTitle}>{t("topPicks.catalogSection")}</h3>
                {catalog.status === "loading" && (
                  <p className={styles.hint}>{t("topPicks.catalogLoading")}</p>
                )}
                {catalog.status === "error" && (
                  <p className={styles.hint}>{t("topPicks.catalogError")}</p>
                )}
                {catalog.status === "success" &&
                  (catalogCandidates.length ? (
                    renderGrid(catalogCandidates)
                  ) : (
                    <p className={styles.hint}>{t("topPicks.catalogNoResult")}</p>
                  ))}
              </>
            )}
            {!searching && seenCandidates.length === 0 && (
              <p className={styles.hint}>
                {t(watched.length ? "topPicks.noResult" : "topPicks.searchCatalogHint")}
              </p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

// Résultats de /search/multi → forme bibliothèque (films et séries seulement).
function searchResultsToItems(results: SearchMultiResult[]): LibraryItemInput[] {
  return results.flatMap((r): LibraryItemInput[] =>
    r.media_type === "movie" || r.media_type === "tv"
      ? [
          {
            id: r.id,
            mediaType: r.media_type,
            title: r.title || r.name || "",
            posterPath: r.poster_path ?? null,
            date: (r.media_type === "movie" ? r.release_date : r.first_air_date) || undefined,
          },
        ]
      : []
  );
}
