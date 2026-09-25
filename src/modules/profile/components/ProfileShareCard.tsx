import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import TopPicksEditor from "./TopPicksEditor.tsx";
import styles from "./ProfileShareCard.module.css";

// Partage du profil en lecture seule : opt-in explicite, le lien n'existe
// qu'une fois le partage activé et meurt dès qu'on le désactive (voir
// handleUpdateProfileShare côté Worker).
export default function ProfileShareCard() {
  const { t } = useTranslation();
  const { shareSlug, setProfileShared } = useAuth();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharePath = shareSlug ? `/u/${shareSlug}` : null;
  const shareUrl = sharePath ? `${window.location.origin}${sharePath}` : null;

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setProfileShared(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profileShare.error"));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!shareUrl) {
      return;
    }
    // Feuille de partage native sur mobile, copie dans le presse-papiers
    // ailleurs (navigator.share est absent de la plupart des navigateurs
    // desktop).
    if (navigator.share) {
      try {
        await navigator.share({ title: t("profileShare.shareTitle"), url: shareUrl });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t("profileShare.copyError"));
    }
  }

  return (
    <div className={styles.card}>
      <span className={styles.k}>{t("profileShare.title")}</span>
      <p className={styles.hint}>{t(shareUrl ? "profileShare.hintOn" : "profileShare.hintOff")}</p>

      {shareUrl && sharePath && (
        <div className={styles.linkRow}>
          <input
            className={styles.linkInput}
            type="text"
            value={shareUrl}
            readOnly
            aria-label={t("profileShare.linkLabel")}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className={styles.primaryBtn} onClick={share}>
            {t("profileShare.share")}
          </button>
          <Link to={sharePath} className={styles.secondaryBtn}>
            {t("profileShare.preview")}
          </Link>
        </div>
      )}

      <div className={styles.actions}>
        {shareUrl ? (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => toggle(false)}
            disabled={busy}
          >
            {t("profileShare.disable")}
          </button>
        ) : (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => toggle(true)}
            disabled={busy}
          >
            {t("profileShare.enable")}
          </button>
        )}
        {copied && <span className={styles.okHint}>{t("profileShare.copied")}</span>}
        {error && <span className={styles.errorHint}>{error}</span>}
      </div>

      {shareUrl && <TopPicksEditor />}
    </div>
  );
}
