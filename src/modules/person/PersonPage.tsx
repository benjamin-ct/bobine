import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { posterUrl, getPerson, getPersonCredits, getGenres } from "../../core/api/tmdb.ts";
import { MediaCard, Loading, ErrorMessage, EmptyState } from "../../shared/components/index.ts";
import FrequentCollaborators from "./components/FrequentCollaborators.tsx";
import { posterAccentFromSeed } from "../../shared/lib/posterAccent.ts";
import posterStyles from "../../shared/styles/posterAccents.module.css";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import type { PersonCredits, PersonDetails } from "../../core/types/tmdb.ts";
import styles from "./PersonPage.module.css";

const DIRECTING_JOBS = new Set(["Director", "Writer", "Screenplay", "Creator"]);

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function dedupeByMedia<T extends { media_type: string; id: number }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.media_type}:${item.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sortByDateDesc<T extends { release_date?: string; first_air_date?: string }>(
  items: T[]
): T[] {
  return items.slice().sort((a, b) => {
    const dateA = a.release_date || a.first_air_date || "";
    const dateB = b.release_date || b.first_air_date || "";
    return dateB.localeCompare(dateA);
  });
}

export default function PersonPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<PersonDetails | null>(null);
  const [credits, setCredits] = useState<PersonCredits | null>(null);
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    setStatus("loading");
    Promise.all([getPerson(id), getPersonCredits(id)])
      .then(([p, c]) => {
        if (cancelled) {
          return;
        }
        setPerson(p);
        setCredits(c);
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
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getGenres("movie"), getGenres("tv")])
      .then(([m, t]) => {
        if (cancelled) {
          return;
        }
        const map: Record<number, string> = {};
        for (const g of [...(m.genres || []), ...(t.genres || [])]) {
          map[g.id] = g.name;
        }
        setGenreMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const asActor = useMemo(() => sortByDateDesc(dedupeByMedia(credits?.cast || [])), [credits]);
  const asCrew = useMemo(
    () =>
      sortByDateDesc(
        dedupeByMedia((credits?.crew || []).filter((c) => DIRECTING_JOBS.has(c.job || "")))
      ),
    [credits]
  );
  const allCredits = useMemo(() => dedupeByMedia([...asActor, ...asCrew]), [asActor, asCrew]);

  const stats = useMemo(() => {
    const rated = allCredits.filter((c) => c.vote_average != null && c.vote_average > 0);
    const avg = rated.length
      ? rated.reduce((s, c) => s + (c.vote_average || 0), 0) / rated.length
      : null;
    const genreCounts = new Map<number, number>();
    for (const c of allCredits) {
      for (const gId of c.genre_ids || []) {
        genreCounts.set(gId, (genreCounts.get(gId) || 0) + 1);
      }
    }
    const topGenreId = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      total: allCredits.length,
      avgRating: avg,
      topGenre: topGenreId != null ? genreMap[topGenreId] : null,
    };
  }, [allCredits, genreMap]);

  if (status === "loading") {
    return (
      <div className={styles.page}>
        <Loading />
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
  if (!person) {
    return null;
  }

  const accentKey = posterAccentFromSeed(person.name);
  const job =
    person.known_for_department === "Directing"
      ? t("personPage.directorRole")
      : person.known_for_department || t("personPage.personality");

  return (
    <div className={styles.page}>
      <Link
        to="/"
        className={styles.back}
        onClick={(e) => {
          // Voir DetailPage : navigate(-1) déclenche un vrai POP, requis
          // pour que useScrollRestoration restaure la liste d'origine.
          e.preventDefault();
          navigate(-1);
        }}
      >
        {t("personPage.back")}
      </Link>

      <div className={`${styles.hero} ${posterStyles[accentKey]}`}>
        <div className={styles.avatarWrap}>
          {person.profile_path ? (
            <img
              src={posterUrl(person.profile_path, "w342") ?? undefined}
              alt={person.name}
              className={styles.avatar}
            />
          ) : (
            <div className={`${styles.avatar} ${styles.avatarEmpty} ${posterStyles[accentKey]}`}>
              {initials(person.name)}
            </div>
          )}
        </div>
        <div className={styles.info}>
          <p className={styles.eyebrow}>{job}</p>
          <h1 className={styles.name}>{person.name}</h1>
          <div className={styles.facts}>
            {person.birthday && (
              <span>
                {t("personPage.bornOn", {
                  date: new Date(person.birthday).toLocaleDateString("fr-FR"),
                })}
              </span>
            )}
            {person.place_of_birth && <span>{person.place_of_birth}</span>}
          </div>
          {person.biography && <p className={styles.bio}>{person.biography}</p>}
          <div className={styles.statRow}>
            <div className={styles.stat}>
              <b>{stats.total}</b>
              <span>{t("personPage.titles")}</span>
            </div>
            <div className={styles.stat}>
              <b>{stats.avgRating != null ? stats.avgRating.toFixed(1) : "—"}</b>
              <span>{t("personPage.averageRating")}</span>
            </div>
            <div className={styles.stat}>
              <b>{stats.topGenre || "—"}</b>
              <span>{t("personPage.favoriteGenre")}</span>
            </div>
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <h3>
          {t("personPage.filmography")}{" "}
          <span className={styles.count}>
            · {t("personPage.titlesCount", { count: asActor.length })}
          </span>
        </h3>
        {asActor.length === 0 ? (
          <EmptyState label={t("personPage.noKnownAppearance")} />
        ) : (
          <div className={gridStyles.grid}>
            {asActor.map((item) => (
              <MediaCard
                key={`${item.media_type}:${item.id}`}
                item={{ ...item, mediaType: item.media_type }}
              />
            ))}
          </div>
        )}
      </section>

      {asCrew.length > 0 && (
        <section className={styles.section}>
          <h3>{t("personPage.asDirectorWriter")}</h3>
          <div className={gridStyles.grid}>
            {asCrew.map((item) => (
              <MediaCard
                key={`${item.media_type}:${item.id}`}
                item={{ ...item, mediaType: item.media_type }}
              />
            ))}
          </div>
        </section>
      )}

      {allCredits.length > 0 && (
        <FrequentCollaborators
          personId={person.id}
          credits={sortByDateDesc(allCredits).map((c) => ({ id: c.id, media_type: c.media_type }))}
        />
      )}
    </div>
  );
}
