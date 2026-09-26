import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getFollowList, type FollowListKind } from "../../../core/api/follows.ts";
import ProfileList from "../ProfileList/ProfileList.tsx";
import Icon from "../Icon/Icon.tsx";
import type { FollowCounts, ProfileSummary } from "../../../core/types/social.ts";
import styles from "./FollowStats.module.css";

interface Props {
  /** Profil partagé affiché, ou `null` pour le compte connecté lui-même. */
  slug: string | null;
  counts: FollowCounts;
  /** Un follow/unfollow depuis une des listes a pu changer les compteurs
   * affichés (ex. mes abonnements) : l'appelant peut les recharger. */
  onListChange?: () => void;
}

type ListState =
  | { status: "loading" }
  | { status: "success"; profiles: ProfileSummary[] }
  | { status: "error"; message: string };

// « X abonnés · Y abonnements », cliquables : chacun ouvre la liste des
// profils correspondants dans une modale (`<dialog>` natif, comme
// MembersOnlyDialog : top layer, piège à focus et Échap gratuits).
export default function FollowStats({ slug, counts, onListChange }: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<FollowListKind | null>(null);
  const [list, setList] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setList({ status: "loading" });
    getFollowList(slug, open)
      .then((profiles) => {
        if (!cancelled) {
          setList({ status: "success", profiles });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setList({
            status: "error",
            message: err instanceof Error ? err.message : t("follow.error"),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, slug, t]);

  function close() {
    setOpen(null);
  }

  return (
    <>
      <div className={styles.stats}>
        <button type="button" className={styles.stat} onClick={() => setOpen("followers")}>
          {t("follow.followersCount", { count: counts.followers })}
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className={styles.stat} onClick={() => setOpen("following")}>
          {t("follow.followingCount", { count: counts.following })}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="follow-list-title"
        onClose={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            close();
          }
        }}
      >
        {open && (
          <div className={styles.content}>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <Icon name="close" />
            </button>
            <h2 id="follow-list-title" className={styles.title}>
              {open === "followers" ? t("follow.followersTitle") : t("follow.followingTitle")}
            </h2>
            {list.status === "loading" && <p className={styles.text}>{t("common.loading")}</p>}
            {list.status === "error" && <p className={styles.text}>{list.message}</p>}
            {list.status === "success" &&
              (list.profiles.length === 0 ? (
                <p className={styles.text}>
                  {open === "followers" ? t("follow.noFollowers") : t("follow.noFollowing")}
                </p>
              ) : (
                <ProfileList
                  profiles={list.profiles}
                  onNavigate={close}
                  onFollowChange={(index, following) => {
                    setList({
                      status: "success",
                      profiles: list.profiles.map((p, i) =>
                        i === index ? { ...p, viewerFollows: following } : p
                      ),
                    });
                    onListChange?.();
                  }}
                />
              ))}
          </div>
        )}
      </dialog>
    </>
  );
}
