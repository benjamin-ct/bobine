import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { posterUrl } from "../../../core/api/tmdbClient.ts";
import type { LibraryItem } from "../../../core/types/library.ts";
import styles from "./TopPicksPanel.module.css";

const MAX_PICKS = 5;

const keyOf = (item: { mediaType: string; id: number }) => `${item.mediaType}:${item.id}`;

// Top 5 du profil partagé choisi à la main parmi ses titres vus, façon
// « films favoris » de Letterboxd. Sans choix, la page publique garde le
// calcul automatique (titres vus les mieux notés). Chaque modification est
// enregistrée tout de suite (PUT /api/account/top-picks).
//
// Sélection dans une modale (clic = ajouter/retirer), ordre par glisser-
// déposer. Le glisser passe par les Pointer Events plutôt que le drag & drop
// HTML5 : ce dernier ne fonctionne pas au doigt sur iOS/Android.
export default function TopPicksPanel() {
  const { t } = useTranslation();
  const { watched } = useLibrary();
  const [picks, setPicks] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/top-picks")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: { topPicks?: string[] }) => {
        if (!cancelled) {
          setPicks(data.topPicks ?? []);
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

  const byKey = useMemo(() => new Map(watched.map((item) => [keyOf(item), item])), [watched]);
  // Un titre retiré des « vus » depuis disparaît aussi du Top (le Worker
  // fait de même côté page publique).
  const chosen = (picks ?? []).filter((key) => byKey.has(key));

  async function save(next: string[]) {
    const previous = picks;
    setPicks(next);
    setError(null);
    try {
      const res = await fetch("/api/account/top-picks", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topPicks: next }),
      });
      if (!res.ok) {
        throw new Error();
      }
    } catch {
      setPicks(previous);
      setError(t("topPicks.saveError"));
    }
  }

  function toggle(key: string) {
    if (chosen.includes(key)) {
      save(chosen.filter((k) => k !== key));
    } else if (chosen.length < MAX_PICKS) {
      save([...chosen, key]);
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
      save(next);
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
        {watched.length > 0 && (
          <button type="button" className={styles.editBtn} onClick={() => setPickerOpen(true)}>
            {t(chosen.length ? "topPicks.edit" : "topPicks.choose")}
          </button>
        )}
      </div>
      <p className={styles.hint}>
        {watched.length === 0
          ? t("topPicks.noWatched")
          : t(
              chosen.length > 1
                ? "topPicks.hintDrag"
                : chosen.length
                  ? "topPicks.hint"
                  : "topPicks.hintEmpty"
            )}
      </p>

      {watched.length > 0 && (
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
                  onClick={() => toggle(key)}
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
      )}

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
  onToggle: (key: string) => void;
}

// Modale de sélection : tous les titres vus (les notés d'abord, du mieux au
// moins bien noté), filtrables par une recherche. Un clic ajoute ou retire le
// titre ; la modale reste ouverte pour en choisir plusieurs d'affilée.
function TopPicksPicker({ open, onClose, watched, chosen, onToggle }: PickerProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      setQuery("");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const candidates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return watched
      .filter((item) => !q || item.title.toLocaleLowerCase().includes(q))
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }, [watched, query]);

  const full = chosen.length >= MAX_PICKS;

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
            <h2 id="top-picks-picker-title" className={styles.dialogTitle}>
              {t("topPicks.pickerTitle", { count: chosen.length, max: MAX_PICKS })}
            </h2>
            <button type="button" className={styles.doneBtn} onClick={onClose}>
              {t("topPicks.done")}
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
          {full && <p className={styles.hint}>{t("topPicks.full")}</p>}
          {candidates.length === 0 ? (
            <p className={styles.hint}>{t("topPicks.noResult")}</p>
          ) : (
            <ul className={styles.grid}>
              {candidates.map((item) => {
                const key = keyOf(item);
                const rank = chosen.indexOf(key) + 1;
                const poster = posterUrl(item.posterPath, "w185");
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={`${styles.candidate} ${rank ? styles.selected : ""}`}
                      onClick={() => onToggle(key)}
                      disabled={!rank && full}
                      aria-pressed={rank > 0}
                    >
                      {poster ? (
                        <img className={styles.poster} src={poster} alt="" loading="lazy" />
                      ) : (
                        <span className={styles.noPoster}>{item.title}</span>
                      )}
                      {rank > 0 && (
                        <span
                          className={`${styles.rank} ${rank <= 3 ? styles[`rank${rank}`] : ""}`}
                        >
                          {rank}
                        </span>
                      )}
                      {item.rating != null && (
                        <span className={styles.rating}>★ {item.rating}</span>
                      )}
                      <span className={styles.candidateTitle}>{item.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </dialog>
  );
}
