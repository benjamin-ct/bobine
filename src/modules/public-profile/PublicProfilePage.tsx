import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  PageHeader,
  MediaCard,
  Loading,
  ErrorMessage,
  EmptyState,
  Dropdown,
} from "../../shared/components/index.ts";
import dropdownStyles from "../../shared/components/Dropdown/Dropdown.module.css";
import { getGenres } from "../../core/api/tmdb.ts";
import { libraryItemToMediaItem } from "../../shared/lib/libraryItem.ts";
import { ratingTier } from "../../shared/lib/ratingTier.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import type { LibraryItem, PublicProfile } from "../../core/types/library.ts";
import styles from "./PublicProfilePage.module.css";

type Tab = "seen" | "want" | string; // string = id de liste personnalisée

type State =
  | { status: "loading" }
  | { status: "success"; profile: PublicProfile }
  | { status: "not-found" }
  | { status: "error"; error: Error };

const RECENT_COUNT = 6;
const TOP_COUNT = 5;

// « Date de visionnage » = dernier passage en « vu » (updatedAt), l'ordre
// déjà renvoyé par le worker.
type SortMode = "recent" | "rating" | "title" | "year";
const SORTS: Array<{ id: SortMode; labelKey: string }> = [
  { id: "recent", labelKey: "publicProfile.sortRecent" },
  { id: "rating", labelKey: "publicProfile.sortRating" },
  { id: "title", labelKey: "publicProfile.sortTitle" },
  { id: "year", labelKey: "publicProfile.sortYear" },
];

function sortItems(items: LibraryItem[], mode: SortMode): LibraryItem[] {
  if (mode === "recent") {
    return items;
  }
  return [...items].sort((a, b) => {
    if (mode === "title") {
      return a.title.localeCompare(b.title, "fr");
    }
    if (mode === "year") {
      return (b.date || "").localeCompare(a.date || "");
    }
    return (b.rating ?? -1) - (a.rating ?? -1);
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Photo servie par le worker (/api/public-profile/:slug/avatar) plutôt que
// par une URL Gravatar construite ici : celle-ci contiendrait le hash de
// l'email du propriétaire. 404 → initiales, comme sur AccountCard.
function ProfileAvatar({ slug, name }: { slug: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [slug]);
  return (
    <div className={styles.avatar}>
      {failed ? (
        initials(name)
      ) : (
        <img
          className={styles.avatarImg}
          src={`/api/public-profile/${encodeURIComponent(slug)}/avatar`}
          alt=""
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function ItemGrid({ items, ranked = false }: { items: LibraryItem[]; ranked?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={gridStyles.grid}>
      {items.map((item, index) => (
        <div key={`${item.mediaType}:${item.id}`}>
          <MediaCard item={libraryItemToMediaItem(item)} rank={ranked ? index + 1 : undefined} />
          {item.rating != null && (
            <p className={styles.meta}>
              <span
                className={`${styles.rating} ${styles[`rating-${ratingTier(item.rating).cls}`]}`}
              >
                {t("publicProfile.rating", { rating: item.rating })}
              </span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// Profil d'un autre membre, partagé en lecture seule via /u/<slug> (voir
// ProfileShareCard) : accessible sans compte. Les cartes restent les
// MediaCard habituelles — leurs boutons « vu »/« envie de voir » agissent
// sur la bibliothèque du visiteur, jamais sur celle du profil consulté.
export default function PublicProfilePage() {
  const { t } = useTranslation();
  const { slug = "" } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("seen");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [genreFilter, setGenreFilter] = useState<number | null>(null);
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});

  // Noms des genres pour le filtre des titres vus (les items ne portent que
  // les ids TMDB). En cas d'échec, le filtre reste simplement masqué.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getGenres("movie"), getGenres("tv")])
      .then(([movie, tv]) => {
        if (cancelled) {
          return;
        }
        const map: Record<number, string> = {};
        for (const g of [...(movie.genres || []), ...(tv.genres || [])]) {
          map[g.id] = g.name;
        }
        setGenreMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const watched = state.status === "success" ? state.profile.watched : null;

  // Genres présents parmi les titres vus, du plus fréquent au moins fréquent.
  const watchedGenres = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of watched ?? []) {
      for (const id of item.genreIds || []) {
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([id]) => genreMap[id])
      .sort((a, b) => b[1] - a[1] || genreMap[a[0]].localeCompare(genreMap[b[0]], "fr"))
      .map(([id, count]) => ({ id, name: genreMap[id], count }));
  }, [watched, genreMap]);

  // Top : les titres vus les mieux notés. À égalité de note (ex. 15 titres
  // à 8/10), les plus récemment vus passent devant.
  const top = useMemo(
    () =>
      (watched ?? [])
        .filter((item) => item.rating != null)
        .sort(
          (a, b) =>
            (b.rating ?? 0) - (a.rating ?? 0) ||
            (b.updatedAt || b.addedAt || 0) - (a.updatedAt || a.addedAt || 0)
        )
        .slice(0, TOP_COUNT),
    [watched]
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setTab("seen");
    setSortMode("recent");
    setGenreFilter(null);
    fetch(`/api/public-profile/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) {
          return { status: "not-found" } as const;
        }
        if (!res.ok) {
          throw new Error(t("publicProfile.loadError"));
        }
        return { status: "success", profile: (await res.json()) as PublicProfile } as const;
      })
      .then((next) => {
        if (!cancelled) {
          setState(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            error: err instanceof Error ? err : new Error(t("publicProfile.loadError")),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  if (state.status === "loading") {
    return <Loading />;
  }
  if (state.status === "error") {
    return (
      <div className={styles.page}>
        <ErrorMessage error={state.error} />
      </div>
    );
  }
  if (state.status === "not-found") {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow={t("publicProfile.eyebrow")}
          title={t("publicProfile.notFoundTitle")}
          lead={t("publicProfile.notFoundLead")}
        />
        <Link to="/" className={styles.homeLink}>
          {t("notFound.backToHome")}
        </Link>
      </div>
    );
  }

  const { profile } = state;
  const name = profile.displayName || t("publicProfile.anonymousName");
  const activeList = profile.customLists.find((l) => l.id === tab);
  const recent = profile.watched.slice(0, RECENT_COUNT);
  const activeGenre = watchedGenres.find((g) => g.id === genreFilter) ?? null;
  const seen = sortItems(
    activeGenre
      ? profile.watched.filter((item) => item.genreIds?.includes(activeGenre.id))
      : profile.watched,
    sortMode
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <ProfileAvatar slug={slug} name={name} />
        <PageHeader
          eyebrow={t("publicProfile.eyebrow")}
          title={name}
          lead={t("publicProfile.lead", {
            watched: profile.watched.length,
            watchlist: profile.watchlist.length,
            lists: profile.customLists.length,
          })}
        />
      </div>

      {top.length > 0 && (
        <section className={styles.section}>
          <h2>{t("publicProfile.top", { count: top.length })}</h2>
          <ItemGrid items={top} ranked />
        </section>
      )}

      {recent.length > 0 && (
        <section className={styles.section}>
          <h2>{t("publicProfile.recent")}</h2>
          <ItemGrid items={recent} />
        </section>
      )}

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          className={`${styles.tab} ${tab === "seen" ? styles.tabActive : ""}`}
          onClick={() => setTab("seen")}
        >
          {t("myListPage.tabSeen")} <span className={styles.count}>{profile.watched.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "want" ? styles.tabActive : ""}`}
          onClick={() => setTab("want")}
        >
          {t("myListPage.tabWant")} <span className={styles.count}>{profile.watchlist.length}</span>
        </button>
        {profile.customLists.map((list) => (
          <button
            key={list.id}
            type="button"
            className={`${styles.tab} ${tab === list.id ? styles.tabActive : ""}`}
            onClick={() => setTab(list.id)}
          >
            {list.name} <span className={styles.count}>{list.items.length}</span>
          </button>
        ))}
      </div>

      {tab === "seen" &&
        (profile.watched.length === 0 ? (
          <EmptyState label={t("publicProfile.emptySeen")} />
        ) : (
          <>
            <div className={styles.tools}>
              {watchedGenres.length > 0 && (
                <Dropdown
                  label={
                    <>
                      {t("publicProfile.genreLabel")}&nbsp;:{" "}
                      {activeGenre ? activeGenre.name : t("publicProfile.genreAll")}
                    </>
                  }
                  active={activeGenre != null}
                >
                  <div className={dropdownStyles.head}>{t("publicProfile.genreLabel")}</div>
                  <button
                    type="button"
                    className={`${dropdownStyles.option} ${activeGenre == null ? dropdownStyles.optionOn : ""}`}
                    onClick={() => setGenreFilter(null)}
                  >
                    <span className={dropdownStyles.radio} /> {t("publicProfile.genreAll")}
                  </button>
                  {watchedGenres.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`${dropdownStyles.option} ${activeGenre?.id === g.id ? dropdownStyles.optionOn : ""}`}
                      onClick={() => setGenreFilter(g.id)}
                    >
                      <span className={dropdownStyles.radio} /> {g.name}{" "}
                      <span className={styles.count}>{g.count}</span>
                    </button>
                  ))}
                </Dropdown>
              )}
              <Dropdown
                label={
                  <>
                    {t("publicProfile.sortLabel")}&nbsp;:{" "}
                    {t(SORTS.find((s) => s.id === sortMode)?.labelKey ?? "")}
                  </>
                }
              >
                <div className={dropdownStyles.head}>{t("publicProfile.sortBy")}</div>
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`${dropdownStyles.option} ${sortMode === s.id ? dropdownStyles.optionOn : ""}`}
                    onClick={() => setSortMode(s.id)}
                  >
                    <span className={dropdownStyles.radio} /> {t(s.labelKey)}
                  </button>
                ))}
              </Dropdown>
            </div>
            <ItemGrid items={seen} />
          </>
        ))}

      {tab === "want" &&
        (profile.watchlist.length === 0 ? (
          <EmptyState label={t("publicProfile.emptyWant")} />
        ) : (
          <ItemGrid items={profile.watchlist} />
        ))}

      {activeList &&
        (activeList.items.length === 0 ? (
          <EmptyState label={t("publicProfile.emptyList")} />
        ) : (
          <ItemGrid items={activeList.items} />
        ))}
    </div>
  );
}
