import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import { gravatarUrl } from "../../../shared/lib/gravatar.ts";
import EmailChangeForm from "./EmailChangeForm.tsx";
import styles from "./AccountCard.module.css";

// Même règle que normalizeUsername côté Worker (worker/share-slug.ts) : on
// n'interroge le serveur que pour une saisie déjà valide.
const USERNAME_PATTERN = /^[a-z0-9_]{3,15}$/;
const USERNAME_CHECK_DELAY_MS = 400;

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

function initials(name: string, fallback: string): string {
  const source = name.trim() || fallback;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AccountCard() {
  const { t } = useTranslation();
  const {
    status,
    email,
    displayName,
    username,
    updateDisplayName,
    updateUsername,
    checkUsername,
    logout,
  } = useAuth();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<UsernameStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);

  // Réinitialise l'état d'échec quand l'e-mail change (ex. après connexion
  // avec un autre compte), sinon un précédent 404 Gravatar resterait collé
  // au nouvel utilisateur.
  useEffect(() => {
    setAvatarFailed(false);
  }, [email]);

  const avatarUrl = useMemo(() => (email ? gravatarUrl(email) : null), [email]);

  // Source de vérité : D1 (colonne users.display_name), chargée avec le
  // reste de la session (voir AuthContext, /api/auth/me) — c'est ce qui
  // rend le nom identique sur tous les appareils une fois enregistré
  // (ticket #45). Resynchronise le champ chaque fois que la valeur connue
  // du serveur change (connexion, ou juste après un enregistrement réussi).
  useEffect(() => {
    setName(displayName ?? "");
  }, [displayName]);

  useEffect(() => {
    setHandle(username ?? "");
  }, [username]);

  // Pseudo (ticket « Ajoute de pseudo ») : disponibilité vérifiée pendant la
  // saisie, avec un léger délai pour ne pas interroger le serveur à chaque
  // frappe. Purement indicatif — l'enregistrement refait la vérification.
  const normalizedHandle = normalizeUsername(handle);
  const handleChanged = normalizedHandle !== (username ?? "");
  useEffect(() => {
    if (!handleChanged || normalizedHandle === "") {
      setHandleStatus("idle");
      return;
    }
    if (!USERNAME_PATTERN.test(normalizedHandle)) {
      setHandleStatus("invalid");
      return;
    }
    setHandleStatus("checking");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      checkUsername(normalizedHandle, controller.signal)
        .then((res) => setHandleStatus(res.available ? "available" : (res.reason ?? "taken")))
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            setHandleStatus("error");
          }
        });
    }, USERNAME_CHECK_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedHandle, handleChanged, checkUsername]);

  if (status !== "authenticated") {
    return (
      <div className={styles.card}>
        <span className={styles.k}>{t("accountCard.title")}</span>
        <p className={styles.hint}>{t("accountCard.loginHint")}</p>
        <Link to="/connexion" className={styles.loginBtn}>
          {t("accountCard.login")}
        </Link>
      </div>
    );
  }

  // Save manuel uniquement (bouton "Enregistrer" ci-dessous) : pas de
  // synchro automatique/temps réel — décision produit explicite pour le
  // ticket #45. Pas de gestion de conflit multi-appareils : dernier
  // enregistrement gagnant, jugé suffisant tant qu'il n'y a pas
  // d'utilisateurs réels.
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateDisplayName(name.trim());
      if (handleChanged) {
        await updateUsername(normalizedHandle);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("accountCard.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.card}>
      <span className={styles.k}>{t("accountCard.title")}</span>
      <div className={styles.row}>
        <div className={styles.avatar}>
          {avatarUrl && !avatarFailed ? (
            <img
              className={styles.avatarImg}
              src={avatarUrl}
              alt=""
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            initials(name, email || "?")
          )}
        </div>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>{t("accountCard.displayName")}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("accountCard.displayNamePlaceholder")}
            />
          </label>
          <label className={styles.field}>
            <span>{t("accountCard.username")}</span>
            <div className={styles.handleInput}>
              <span className={styles.handlePrefix} aria-hidden="true">
                @
              </span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={t("accountCard.usernamePlaceholder")}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={16}
                aria-describedby="account-username-status"
              />
            </div>
            <small
              id="account-username-status"
              className={
                handleStatus === "available"
                  ? styles.handleOk
                  : handleStatus === "taken" ||
                      handleStatus === "invalid" ||
                      handleStatus === "error"
                    ? styles.handleError
                    : styles.handleHint
              }
              aria-live="polite"
            >
              {handleStatus === "idle"
                ? t("accountCard.usernameHint")
                : t(`accountCard.username_${handleStatus}`)}
            </small>
          </label>
          <div className={styles.field}>
            <label htmlFor="account-email">{t("accountCard.email")}</label>
            <div className={styles.inline}>
              <input id="account-email" type="email" value={email || ""} disabled />
              {!editingEmail && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setEmailChanged(false);
                    setEditingEmail(true);
                  }}
                >
                  {t("accountCard.emailChange.edit")}
                </button>
              )}
            </div>
            {editingEmail && (
              <EmailChangeForm
                onCancel={() => setEditingEmail(false)}
                onDone={() => {
                  setEditingEmail(false);
                  setEmailChanged(true);
                }}
              />
            )}
            {emailChanged && (
              <p className={styles.savedHint}>{t("accountCard.emailChange.done")}</p>
            )}
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={save}
          disabled={
            saving || (handleChanged && handleStatus !== "available" && normalizedHandle !== "")
          }
        >
          {saving ? t("accountCard.saving") : t("accountCard.save")}
        </button>
        <button type="button" className={styles.logoutBtn} onClick={logout}>
          {t("accountCard.logout")}
        </button>
        {saved && <span className={styles.savedHint}>{t("accountCard.saved")}</span>}
        {error && <span className={styles.errorHint}>{error}</span>}
      </div>
    </div>
  );
}
