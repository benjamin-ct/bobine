import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import styles from "./AccountCard.module.css";

// Changement d'adresse email depuis la carte Compte, en deux étapes : saisie
// de la nouvelle adresse (un code y est envoyé), puis saisie de ce code. Tant
// que le code n'est pas confirmé, l'adresse du compte ne change pas.
export default function EmailChangeForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { requestEmailChange, confirmEmailChange } = useAuth();
  const [newEmail, setNewEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("accountCard.emailChange.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  function sendCode(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      const result = await requestEmailChange(newEmail.trim());
      setSentTo(result.email);
      setDevCode(result.devCode ?? null);
      setCode("");
    });
  }

  function confirm(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await confirmEmailChange(code.trim());
      onDone();
    });
  }

  if (sentTo === null) {
    return (
      <form className={styles.emailChange} onSubmit={sendCode}>
        <label className={styles.field}>
          <span>{t("accountCard.emailChange.newEmail")}</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder={t("accountCard.emailChange.newEmailPlaceholder")}
          />
        </label>
        <p className={styles.hint}>{t("accountCard.emailChange.hint")}</p>
        <div className={styles.inline}>
          <button type="submit" className={styles.saveBtn} disabled={busy || !newEmail.trim()}>
            {busy ? t("accountCard.emailChange.sending") : t("accountCard.emailChange.sendCode")}
          </button>
          <button type="button" className={styles.logoutBtn} onClick={onCancel}>
            {t("accountCard.emailChange.cancel")}
          </button>
        </div>
        {error && <span className={styles.errorHint}>{error}</span>}
      </form>
    );
  }

  return (
    <form className={styles.emailChange} onSubmit={confirm}>
      <p className={styles.hint}>{t("accountCard.emailChange.codeSent", { email: sentTo })}</p>
      {devCode && (
        <p className={styles.hint}>{t("accountCard.emailChange.devCode", { code: devCode })}</p>
      )}
      <label className={styles.field}>
        <span>{t("accountCard.emailChange.code")}</span>
        <input
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <div className={styles.inline}>
        <button type="submit" className={styles.saveBtn} disabled={busy || !code.trim()}>
          {busy ? t("accountCard.emailChange.confirming") : t("accountCard.emailChange.confirm")}
        </button>
        <button
          type="button"
          className={styles.logoutBtn}
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
        >
          {t("accountCard.emailChange.back")}
        </button>
        <button type="button" className={styles.logoutBtn} onClick={onCancel}>
          {t("accountCard.emailChange.cancel")}
        </button>
      </div>
      {error && <span className={styles.errorHint}>{error}</span>}
    </form>
  );
}
