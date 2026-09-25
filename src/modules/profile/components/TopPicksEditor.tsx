import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { posterUrl } from "../../../core/api/tmdbClient.ts";
import styles from "./ProfileShareCard.module.css";

const MAX_PICKS = 5;
const MAX_RESULTS = 8;

const keyOf = (item: { mediaType: string; id: number }) => `${item.mediaType}:${item.id}`;

// Top 5 du profil partagé choisi à la main parmi ses titres vus, façon
// « films favoris » de Letterboxd. Sans choix, la page publique garde le
// calcul automatique (titres vus les mieux notés). Chaque modification est
// enregistrée tout de suite (PUT /api/account/top-picks).
export default function TopPicksEditor() {
  const { t } = useTranslation();
  const { watched } = useLibrary();
  const [picks, setPicks] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) {
      return [];
    }
    return watched
      .filter((item) => !chosen.includes(keyOf(item)))
      .filter((item) => item.title.toLocaleLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, watched, chosen]);

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

  function move(index: number, delta: number) {
    const next = [...chosen];
    const [key] = next.splice(index, 1);
    next.splice(index + delta, 0, key);
    save(next);
  }

  if (picks === null) {
    return null;
  }

  return (
    <div className={styles.topPicks}>
      <span className={styles.k}>{t("topPicks.title")}</span>
      <p className={styles.hint}>{t(chosen.length ? "topPicks.hint" : "topPicks.hintEmpty")}</p>

      {chosen.length > 0 && (
        <ol className={styles.pickList}>
          {chosen.map((key, index) => {
            const item = byKey.get(key)!;
            return (
              <li key={key} className={styles.pickRow}>
                <span className={styles.pickRank}>{index + 1}</span>
                <img
                  className={styles.pickThumb}
                  src={posterUrl(item.posterPath, "w92") ?? undefined}
                  alt=""
                />
                <span className={styles.pickTitle}>{item.title}</span>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t("topPicks.moveUp")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => move(index, 1)}
                  disabled={index === chosen.length - 1}
                  aria-label={t("topPicks.moveDown")}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => save(chosen.filter((k) => k !== key))}
                  aria-label={t("topPicks.remove")}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {chosen.length < MAX_PICKS &&
        (watched.length === 0 ? (
          <p className={styles.hint}>{t("topPicks.noWatched")}</p>
        ) : (
          <>
            <input
              className={styles.linkInput}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("topPicks.searchPlaceholder", { count: MAX_PICKS - chosen.length })}
              aria-label={t("topPicks.searchLabel")}
            />
            {results.length > 0 && (
              <ul className={styles.pickList}>
                {results.map((item) => (
                  <li key={keyOf(item)}>
                    <button
                      type="button"
                      className={styles.pickResult}
                      onClick={() => {
                        setQuery("");
                        save([...chosen, keyOf(item)]);
                      }}
                    >
                      <img
                        className={styles.pickThumb}
                        src={posterUrl(item.posterPath, "w92") ?? undefined}
                        alt=""
                      />
                      <span className={styles.pickTitle}>{item.title}</span>
                      <span className={styles.pickAdd}>+</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim() && results.length === 0 && (
              <p className={styles.hint}>{t("topPicks.noResult")}</p>
            )}
          </>
        ))}

      {error && <p className={styles.errorHint}>{error}</p>}
    </div>
  );
}
