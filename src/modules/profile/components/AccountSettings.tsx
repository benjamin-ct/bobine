import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import { gravatarUrl } from "../../../shared/lib/gravatar.ts";
import { Icon } from "../../../shared/components/index.ts";
import EmailChangeForm from "./EmailChangeForm.tsx";
import { SettingsGroup, SettingsRow } from "./SettingsGroup.tsx";
import styles from "./AccountSettings.module.css";

// Même règle que normalizeUsername côté Worker (worker/share-slug.ts) : on
// n'interroge le serveur que pour une saisie déjà valide.
const USERNAME_PATTERN = /^[a-z0-9_]{3,15}$/;
const USERNAME_CHECK_DELAY_MS = 400;

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

/** Initiale affichée dans l'avatar quand il n'y a pas de photo Gravatar. */
function initial(name: string, fallback: string): string {
  return (name.trim() || fallback).charAt(0).toUpperCase() || "?";
}

/** Avatar du compte : photo Gravatar si elle existe, sinon l'initiale. */
export function AccountAvatar({ name, className }: { name: string; className: string }) {
  const { email } = useAuth();
  const [failed, setFailed] = useState(false);
  // Réinitialise l'état d'échec quand l'e-mail change (ex. après connexion
  // avec un autre compte), sinon un précédent 404 Gravatar resterait collé
  // au nouvel utilisateur.
  useEffect(() => {
    setFailed(false);
  }, [email]);
  const url = useMemo(() => (email ? gravatarUrl(email) : null), [email]);
  return (
    <div className={className} aria-hidden="true">
      {url && !failed ? (
        <img className={styles.avatarImg} src={url} alt="" onError={() => setFailed(true)} />
      ) : (
        initial(name, email || "?")
      )}
    </div>
  );
}

// Nouvelle DA 7/10 : groupe « Compte » de l'onglet Compte (identité, e-mail,
// session). C'est désormais le seul endroit où se déconnecter.
export default function AccountSettings() {
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
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);

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
  const nameChanged = name.trim() !== (displayName ?? "");
  const dirty = nameChanged || handleChanged;
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

  // Le « ✓ Enregistré » disparaît dès qu'on recommence à modifier.
  useEffect(() => {
    if (dirty) {
      setSaved(false);
    }
  }, [dirty]);

  if (status !== "authenticated") {
    return null;
  }

  // Save manuel uniquement (barre « Modifications non enregistrées ») : pas
  // de synchro automatique/temps réel — décision produit explicite pour le
  // ticket #45. Pas de gestion de conflit multi-appareils : dernier
  // enregistrement gagnant.
  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (nameChanged) {
        await updateDisplayName(name.trim());
      }
      if (handleChanged) {
        await updateUsername(normalizedHandle);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("accountCard.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setName(displayName ?? "");
    setHandle(username ?? "");
    setError(null);
  }

  // Aperçu en direct : reflète la saisie en cours, avant enregistrement.
  const previewName = name.trim() || t("accountCard.previewNoName");
  const previewHandle = normalizedHandle || username || "";
  const blockingHandle = handleChanged && normalizedHandle !== "" && handleStatus !== "available";

  return (
    <SettingsGroup title={t("accountCard.groupTitle")} description={t("accountCard.groupLead")}>
      <SettingsRow label={t("accountCard.identity")} description={t("accountCard.identityHint")}>
        <div className={styles.preview}>
          <AccountAvatar name={name} className={styles.avatar} />
          <div className={styles.previewText}>
            <strong className={styles.previewName}>{previewName}</strong>
            {previewHandle ? (
              <>
                <span className={styles.mono}>@{previewHandle}</span>
                <span className={`${styles.mono} ${styles.previewLink}`}>
                  <Icon name="link" size={13} />
                  {window.location.host}/u/{previewHandle}
                </span>
              </>
            ) : (
              <span className={styles.previewLink}>{t("accountCard.previewNoUsername")}</span>
            )}
          </div>
          <span className={styles.previewTag}>{t("accountCard.preview")}</span>
        </div>

        <div className={styles.identityFields}>
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
                  ? styles.okHint
                  : handleStatus === "taken" ||
                      handleStatus === "invalid" ||
                      handleStatus === "error"
                    ? styles.errorHint
                    : styles.mutedHint
              }
              aria-live="polite"
            >
              {handleStatus === "idle"
                ? t("accountCard.usernameHint")
                : t(`accountCard.username_${handleStatus}`)}
            </small>
          </label>
        </div>

        {dirty ? (
          <div className={styles.saveBar} role="status">
            <span className={styles.saveBarText}>{t("accountCard.unsaved")}</span>
            {error && <span className={styles.errorHint}>{error}</span>}
            <div className={styles.saveBarActions}>
              <button type="button" className={styles.ghostBtn} onClick={cancel} disabled={saving}>
                {t("accountCard.cancel")}
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={save}
                disabled={saving || blockingHandle}
              >
                {saving ? t("accountCard.saving") : t("accountCard.save")}
              </button>
            </div>
          </div>
        ) : (
          saved && (
            <p className={styles.okHint} role="status">
              <Icon name="check" size={14} strokeWidth={2.6} /> {t("accountCard.saved")}
            </p>
          )
        )}
      </SettingsRow>

      <SettingsRow label={t("accountCard.email")} description={t("accountCard.emailHint")}>
        <div className={styles.inline}>
          <input
            className={styles.readonlyInput}
            type="email"
            value={email || ""}
            readOnly
            aria-label={t("accountCard.email")}
          />
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
        <p className={styles.subtleHint}>
          <Icon name="lock" size={14} /> {t("accountCard.emailPrivate")}
        </p>
        {editingEmail && (
          <EmailChangeForm
            onCancel={() => setEditingEmail(false)}
            onDone={() => {
              setEditingEmail(false);
              setEmailChanged(true);
            }}
          />
        )}
        {emailChanged && <p className={styles.okHint}>{t("accountCard.emailChange.done")}</p>}
      </SettingsRow>

      <SettingsRow label={t("accountCard.session")} description={t("accountCard.sessionHint")}>
        <button type="button" className={styles.secondaryBtn} onClick={logout}>
          {t("accountCard.logout")}
        </button>
      </SettingsRow>
    </SettingsGroup>
  );
}
