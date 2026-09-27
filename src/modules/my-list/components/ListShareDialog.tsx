import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../../shared/components/index.ts";
import styles from "./ListShareDialog.module.css";

interface ListShareDialogProps {
  open: boolean;
  onClose: () => void;
  listId: string;
  listName: string;
  /** Slug du lien public (/liste/<slug>), null si la liste n'est pas partagée. */
  slug: string | null;
  onSlugChange: (slug: string | null) => void;
}

async function putListShare(listId: string, enabled: boolean): Promise<Response> {
  return fetch("/api/list-shares", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listId, enabled }),
  });
}

// Partage d'une liste perso en lecture seule (modale sur desktop, feuille du
// bas sur mobile). Le lien public est créé à la demande puis réutilisé tant
// que le partage n'est pas arrêté (voir handlePutListShare côté Worker).
// Aucun dialogue natif du navigateur : la confirmation d'arrêt se fait dans
// la modale, et la copie retombe sur la sélection du lien si le
// presse-papiers est refusé.
export default function ListShareDialog({
  open,
  onClose,
  listId,
  listName,
  slug,
  onSlugChange,
}: ListShareDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      setError(null);
      setCopyState("idle");
      setConfirmingStop(false);
      setStopped(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (copyState !== "copied") {
      return;
    }
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const url = slug ? `${window.location.origin}/liste/${slug}` : null;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await putListShare(listId, true);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slug) {
        // 404 = liste créée à l'instant, pas encore synchronisée (envoi
        // groupé côté LibraryContext) : un nouvel essai suffit.
        setError(t(res.status === 404 ? "listShare.notSyncedYet" : "listShare.error"));
        return;
      }
      setStopped(false);
      onSlugChange(data.slug as string);
    } catch {
      setError(t("listShare.error"));
    } finally {
      setBusy(false);
    }
  }

  async function stopSharing() {
    setBusy(true);
    setError(null);
    try {
      const res = await putListShare(listId, false);
      if (!res.ok) {
        throw new Error();
      }
      setConfirmingStop(false);
      setStopped(true);
      onSlugChange(null);
    } catch {
      setError(t("listShare.stopError"));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      linkRef.current?.select();
      setCopyState("manual");
    }
  }

  async function nativeShare() {
    if (!url) {
      return;
    }
    try {
      await navigator.share({ title: listName, url });
    } catch {
      // Feuille de partage refermée : rien à signaler.
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="list-share-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {open && (
        <div className={styles.content}>
          <span className={styles.sheetGrabber} aria-hidden />
          <div className={styles.head}>
            <div>
              <h2 id="list-share-title" className={styles.title}>
                {t("listShare.title", { name: listName })}
              </h2>
              <p className={styles.subtitle}>
                {t(url ? "listShare.statusShared" : "listShare.statusPrivate")}
              </p>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label={t("listShare.close")}
            >
              <Icon name="close" />
            </button>
          </div>

          {url ? (
            <>
              <div className={styles.linkField}>
                <Icon name="link" />
                <input
                  ref={linkRef}
                  type="text"
                  readOnly
                  value={url}
                  aria-label={t("listShare.linkLabel")}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" className={styles.copyBtn} onClick={copy}>
                  <Icon name={copyState === "copied" ? "check" : "copy"} />
                  {t(copyState === "copied" ? "listShare.copied" : "listShare.copy")}
                </button>
              </div>
              {copyState === "manual" && (
                <p className={styles.hint} role="status">
                  {t("listShare.copyManual")}
                </p>
              )}
              <div className={styles.actions}>
                {canNativeShare && (
                  <button type="button" className={styles.secondaryBtn} onClick={nativeShare}>
                    <Icon name="share" /> {t("listShare.nativeShare")}
                  </button>
                )}
                <a className={styles.secondaryBtn} href={url} target="_blank" rel="noopener">
                  <Icon name="external" /> {t("listShare.viewPublic")}
                </a>
              </div>

              <div className={styles.stopZone}>
                {confirmingStop ? (
                  <div className={styles.confirm} role="group" aria-labelledby="list-share-stop">
                    <p id="list-share-stop" className={styles.confirmText}>
                      {t("listShare.confirmStop")}
                    </p>
                    <div className={styles.confirmActions}>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => setConfirmingStop(false)}
                        disabled={busy}
                      >
                        {t("listShare.cancel")}
                      </button>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={stopSharing}
                        disabled={busy}
                        autoFocus
                      >
                        {t("listShare.stopConfirmButton")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.stopBtn}
                    onClick={() => setConfirmingStop(true)}
                  >
                    <Icon name="ban" /> {t("listShare.stop")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {stopped && (
                <p className={styles.stoppedNotice} role="status">
                  <Icon name="check" /> {t("listShare.stopped")}
                </p>
              )}
              <h3 className={styles.sectionTitle}>{t("listShare.visibleTitle")}</h3>
              <ul className={styles.visibleList}>
                <li>
                  <Icon name="list" /> {t("listShare.visibleTitles")}
                </li>
                <li>
                  <Icon name="user" /> {t("listShare.visibleName")}
                </li>
                <li>
                  <Icon name="refresh" /> {t("listShare.visibleUpdates")}
                </li>
              </ul>
              <p className={styles.hint}>
                <Icon name="lock" /> {t("listShare.nothingElse")}
              </p>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={createLink}
                disabled={busy}
              >
                <Icon name="link" /> {t("listShare.createLink")}
              </button>
            </>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
