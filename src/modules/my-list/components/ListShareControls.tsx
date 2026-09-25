import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import styles from "./CustomListPanel.module.css";

interface ListShareControlsProps {
  listId: string;
  listName: string;
}

async function putListShare(listId: string, enabled: boolean): Promise<Response> {
  return fetch("/api/list-shares", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listId, enabled }),
  });
}

// Partage d'une liste perso en lecture seule : le lien public (/liste/<slug>)
// est créé au premier clic sur « Partager » puis réutilisé tant que le
// partage n'est pas arrêté (voir handlePutListShare côté Worker).
export default function ListShareControls({ listId, listName }: ListShareControlsProps) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setSlug(null);
    setFeedback(null);
    if (status !== "authenticated") {
      return;
    }
    let cancelled = false;
    fetch("/api/list-shares")
      .then((res): Promise<Record<string, string>> | Record<string, string> =>
        res.ok ? res.json() : {}
      )
      .then((shares) => {
        if (!cancelled) {
          setSlug(shares[listId] ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listId, status]);

  if (status !== "authenticated") {
    return null;
  }

  function flash(ok: boolean, text: string) {
    setFeedback({ ok, text });
    setTimeout(() => setFeedback(null), 2500);
  }

  async function shareLink(url: string) {
    // Feuille de partage native sur mobile, copie dans le presse-papiers
    // ailleurs (navigator.share est absent de la plupart des navigateurs
    // desktop).
    if (navigator.share) {
      try {
        await navigator.share({ title: listName, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash(true, t("listShare.copied"));
    } catch {
      window.prompt(t("listShare.copyPrompt"), url);
    }
  }

  async function share() {
    setBusy(true);
    try {
      let current = slug;
      if (!current) {
        const res = await putListShare(listId, true);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.slug) {
          // 404 = liste créée à l'instant, pas encore synchronisée (envoi
          // groupé côté LibraryContext) : un nouvel essai suffit.
          flash(false, t(res.status === 404 ? "listShare.notSyncedYet" : "listShare.error"));
          return;
        }
        current = data.slug as string;
        setSlug(current);
      }
      await shareLink(`${window.location.origin}/liste/${current}`);
    } catch {
      flash(false, t("listShare.error"));
    } finally {
      setBusy(false);
    }
  }

  async function unshare() {
    if (!window.confirm(t("listShare.confirmUnshare", { name: listName }))) {
      return;
    }
    setBusy(true);
    try {
      const res = await putListShare(listId, false);
      if (!res.ok) {
        throw new Error();
      }
      setSlug(null);
      flash(true, t("listShare.unshared"));
    } catch {
      flash(false, t("listShare.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.ghostBtn} onClick={share} disabled={busy}>
        {t(slug ? "listShare.shareAgain" : "listShare.share")}
      </button>
      {slug && (
        <button type="button" className={styles.ghostBtn} onClick={unshare} disabled={busy}>
          {t("listShare.unshare")}
        </button>
      )}
      {feedback && (
        <span className={feedback.ok ? styles.okHint : styles.errorHint} role="status">
          {feedback.text}
        </span>
      )}
    </>
  );
}
