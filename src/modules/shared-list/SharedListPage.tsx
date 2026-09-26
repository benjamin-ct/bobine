import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  PageHeader,
  MediaCard,
  Loading,
  ErrorMessage,
  EmptyState,
  Icon,
} from "../../shared/components/index.ts";
import { libraryItemToMediaItem } from "../../shared/lib/libraryItem.ts";
import gridStyles from "../../shared/styles/mediaGrid.module.css";
import type { PublicList } from "../../core/types/library.ts";
import styles from "./SharedListPage.module.css";

type State =
  | { status: "loading" }
  | { status: "success"; list: PublicList }
  | { status: "not-found" }
  | { status: "error"; error: Error };

// Liste perso d'un autre membre, partagée en lecture seule via /liste/<slug>
// (voir ListShareControls) : accessible sans compte. Les cartes restent les
// MediaCard habituelles — leurs boutons « vu »/« envie de voir » agissent
// sur la bibliothèque du visiteur, jamais sur la liste consultée. Le
// propriétaire qui ouvre son propre lien est renvoyé vers sa vue éditable.
export default function SharedListPage() {
  const { t } = useTranslation();
  const { slug = "" } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
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

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={t("sharedList.eyebrow")}
        title={list.name}
        lead={t("sharedList.lead", {
          owner: list.ownerName || t("sharedList.anonymousOwner"),
          count: list.items.length,
        })}
      />

      {list.items.length === 0 ? (
        <EmptyState label={t("sharedList.empty")} />
      ) : (
        <div className={gridStyles.grid}>
          {list.items.map((item) => (
            <div key={`${item.mediaType}:${item.id}`}>
              <MediaCard item={libraryItemToMediaItem(item)} />
              {item.rating != null && (
                <p className={styles.rating}>
                  <Icon name="star" filled /> {t("sharedList.rating", { rating: item.rating })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
