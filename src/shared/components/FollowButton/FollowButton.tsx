import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMembersOnly } from "../../../core/context/MembersOnlyContext.tsx";
import { setFollowing } from "../../../core/api/follows.ts";
import type { FollowCounts } from "../../../core/types/social.ts";
import styles from "./FollowButton.module.css";

interface Props {
  slug: string;
  following: boolean;
  /** Appelé après chaque changement confirmé par le serveur, avec les
   * compteurs à jour du profil concerné. */
  onChange?: (following: boolean, counts: FollowCounts) => void;
  compact?: boolean;
}

const CONFIRM_TIMEOUT_MS = 4000;

// « Suivre » → « Suivi » ; ne plus suivre demande une confirmation : un
// premier clic sur « Suivi » le transforme en « Ne plus suivre ? », un
// second clic confirme (retour automatique à « Suivi » sinon).
export default function FollowButton({ slug, following, onChange, compact = false }: Props) {
  const { t } = useTranslation();
  const { requireMember } = useMembersOnly();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) {
      return;
    }
    const timer = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function apply(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const counts = await setFollowing(slug, next);
      onChange?.(next, counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("follow.error"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  function handleClick() {
    if (!requireMember()) {
      return;
    }
    if (!following) {
      void apply(true);
    } else if (confirming) {
      void apply(false);
    } else {
      setConfirming(true);
    }
  }

  const label = !following
    ? t("follow.follow")
    : confirming
      ? t("follow.unfollow")
      : t("follow.following");

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={`${styles.button} ${compact ? styles.compact : ""} ${
          following ? (confirming ? styles.danger : styles.active) : ""
        }`}
        onClick={handleClick}
        onBlur={() => setConfirming(false)}
        disabled={busy}
        aria-pressed={following}
      >
        {label}
      </button>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
