import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../shared/hooks/useDocumentTitle.ts";
import {
  PageHeader,
  MediaCard,
  Loading,
  ErrorMessage,
  EmptyState,
  Icon,
  ListCover,
  ReadOnlyBanner,
} from "../../shared/components/index.ts";
import { getGenres } from "../../core/api/tmdb.ts";
import { useAuth } from "../../core/context/AuthContext.tsx";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import { useLocale } from "../../core/context/LocaleContext.tsx";
import { useMembersOnly } from "../../core/context/MembersOnlyContext.tsx";
import { libraryItemToMediaItem } from "../../shared/lib/libraryItem.ts";
import { timeAgo } from "../../shared/lib/timeAgo.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import type { LibraryItem, PublicList } from "../../core/types/library.ts";
import styles from "./SharedListPage.module.css";

type State =
  | { status: "loading" }
  | { status: "success"; list: PublicList }
  | { status: "not-found" }
  | { status: "error"; error: Error };

type SortMode = "owner" | "rating" | "recent";

function sortItems(items: LibraryItem[], mode: SortMode): LibraryItem[] {
  if (mode === "owner") {
    return items;
  }
  return [...items].sort((a, b) =>
    mode === "rating" ? (b.rating ?? -1) - (a.rating ?? -1) : (b.addedAt || 0) - (a.addedAt || 0)
  );
}

// Liste perso d'un autre membre, partagée en lecture seule via /liste/<slug>
// (voir ListShareDialog) : accessible sans compte. Les cartes restent les
// MediaCard habituelles — la pastille dorée porte la note du propriétaire,
// les boutons « vu »/« envie de voir » agissent sur la bibliothèque du
// visiteur, jamais sur la liste consultée. Le propriétaire qui ouvre son
// propre lien est renvoyé vers sa vue éditable.
export default function SharedListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { status: authStatus } = useAuth();
  const { requireMember } = useMembersOnly();
  const { isWatched, isInWatchlist, toggleWatchlist } = useLibrary();
  const { slug = "" } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const [sortMode, setSortMode] = useState<SortMode>("owner");
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});
  const [linkCopied, setLinkCopied] = useState(false);
  useDocumentTitle(
    state.status === "success"
      ? state.list.name
      : state.status === "not-found"
        ? t("pageTitle.notFound")
        : null
  );

  // Noms des genres pour « année · genre » sous les affiches ; en cas
  // d'échec, seule l'année s'affiche.
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

  useEffect(() => {
    if (!linkCopied) {
      return;
    }
    const timer = setTimeout(() => setLinkCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [linkCopied]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setSortMode("owner");
    fetch(`/api/public-list/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) {
          return { status: "not-found" } as const;
        }
        if (!res.ok) {
          throw new Error(t("sharedList.loadError"));
        }
        return { status: "success", list: (await res.json()) as PublicList } as const;
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
            error: err instanceof Error ? err : new Error(t("sharedList.loadError")),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  const items = state.status === "success" ? state.list.items : null;
  const sorted = useMemo(() => sortItems(items ?? [], sortMode), [items, sortMode]);

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
          eyebrow={t("sharedList.eyebrow")}
          title={t("sharedList.notFoundTitle")}
          lead={t("sharedList.notFoundLead")}
        />
        <Link to="/" className={styles.homeLink}>
          {t("notFound.backToHome")}
        </Link>
      </div>
    );
  }

  const { list } = state;
  if (list.ownListId) {
    return (
      <Navigate to={`/profil?tab=ma-liste&liste=${encodeURIComponent(list.ownListId)}`} replace />
    );
  }

  const loggedIn = authStatus === "authenticated";
  const owner = list.ownerName || t("sharedList.anonymousOwner");
  const updated = timeAgo(list.updatedAt, locale);
  // Titres ni vus ni déjà en envie : ceux que « Tout ajouter » ajouterait.
  const toAdd = list.items.filter(
    (item) => !isWatched(item.mediaType, item.id) && !isInWatchlist(item.mediaType, item.id)
  );

  function addAll() {
    if (!requireMember()) {
      return;
    }
    for (const item of toAdd) {
      toggleWatchlist({
        id: item.id,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        date: item.date,
        genreIds: item.genreIds,
      });
    }
  }

  // Feuille de partage native quand elle existe (mobile), sinon copie du lien.
  async function share() {
    const url = `${window.location.origin}/liste/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: list.name, url });
      } catch {
        // Partage annulé par l'utilisateur : rien à faire.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
    } catch {
      // Presse-papiers indisponible : l'adresse reste dans la barre du navigateur.
    }
  }

  const sorts: Array<{ id: SortMode; label: string }> = [
    { id: "owner", label: t("sharedList.sortOwner", { name: owner }) },
    { id: "rating", label: t("sharedList.sortRating") },
    { id: "recent", label: t("sharedList.sortRecent") },
  ];

  return (
    <div className={styles.page}>
      {!loggedIn && authStatus !== "loading" && (
        <ReadOnlyBanner>{t("sharedList.readOnly")}</ReadOnlyBanner>
      )}

      <header className={styles.header}>
        <ListCover items={list.items} size="lg" />
        <div className={styles.headerBody}>
          <p className={styles.eyebrow}>{t("sharedList.eyebrow")}</p>
          <h1 className={styles.title}>{list.name}</h1>
          <p className={styles.meta}>
            <span className={styles.byline}>
              <span className={styles.ownerAvatar} aria-hidden>
                {owner.trim().charAt(0).toUpperCase()}
              </span>
              {t("sharedList.by")}{" "}
              {list.ownerHandle ? (
                <Link to={`/u/${list.ownerHandle}`} className={styles.owner}>
                  {owner}
                </Link>
              ) : (
                <span className={styles.owner}>{owner}</span>
              )}
            </span>
            <span aria-hidden>·</span>
            <span>{t("sharedList.count", { count: list.items.length })}</span>
            {updated && (
              <>
                <span aria-hidden className={styles.updatedSep}>
                  ·
                </span>
                <span className={styles.updated}>{t("sharedList.updated", { when: updated })}</span>
              </>
            )}
          </p>
          <div className={styles.actions}>
            {list.items.length > 0 && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={addAll}
                disabled={loggedIn && toAdd.length === 0}
              >
                <Icon name={loggedIn && toAdd.length === 0 ? "check" : "star"} size={16} />
                {loggedIn && toAdd.length === 0 ? t("sharedList.allAdded") : t("sharedList.addAll")}
              </button>
            )}
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.shareBtn}`}
              onClick={() => void share()}
              aria-label={t("sharedList.share")}
              title={t("sharedList.share")}
            >
              <Icon name={linkCopied ? "check" : "share"} size={16} />
              <span className={styles.shareLabel}>
                {linkCopied ? t("sharedList.linkCopied") : t("sharedList.share")}
              </span>
            </button>
          </div>
        </div>
      </header>

      {list.items.length === 0 ? (
        <EmptyState label={t("sharedList.empty")} />
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.segmented} role="group" aria-label={t("sharedList.sortLabel")}>
              {sorts.map((sort) => (
                <button
                  key={sort.id}
                  type="button"
                  aria-pressed={sortMode === sort.id}
                  className={`${styles.segment} ${sortMode === sort.id ? styles.segmentActive : ""}`}
                  onClick={() => setSortMode(sort.id)}
                >
                  {sort.label}
                </button>
              ))}
            </div>
            <p className={styles.legend}>
              <Icon name="star" size={12} filled /> {t("sharedList.legend", { name: owner })}
            </p>
          </div>
          <div className={gridStyles.grid}>
            {sorted.map((item, index) => (
              <MediaCard
                key={`${item.mediaType}:${item.id}`}
                item={libraryItemToMediaItem(item)}
                ownerRating={item.rating}
                position={sortMode === "owner" ? index + 1 : undefined}
                yearGenre
                genreName={(item.genreIds ?? []).map((id) => genreMap[id]).find(Boolean)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
