import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../core/context/AuthContext.tsx";
import styles from "./AuthPages.module.css";

// Formulaire de connexion par lien magique (email, puis code de repli),
// partagé entre la page /connexion et la modale "action réservée aux
// membres" (voir MembersOnlyDialog). La suite (redirection, fermeture de la
// modale) est pilotée par l'appelant via le statut d'auth, qui passe à
// "authenticated" dès que le code est validé.
export default function LoginForm() {
  const { t } = useTranslation();
  const { requestLink, verifyCode } = useAuth();
  const idPrefix = useId();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const data = await requestLink(email.trim());
      setSent(true);
      setDevLink(data.devLink || null);
      setDevCode(data.devCode || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginPage.unknownError"));
    } finally {
      setSending(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      return;
    }
    setVerifying(true);
    setCodeError(null);
    try {
      await verifyCode(code.trim());
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : t("loginPage.unknownError"));
    } finally {
      setVerifying(false);
    }
  }

  if (sent) {
    return (
      <>
        <div className={styles.card}>
          <p>
            {t("loginPage.linkSentBefore")}
            <strong>{email.trim()}</strong>
            {t("loginPage.linkSentAfter")}
          </p>
          <p className={styles.subtitle}>{t("loginPage.checkInbox")}</p>
          {devLink && (
            <p className={styles.subtitle}>
              {t("loginPage.devModeLinkLabel")}
              <a href={devLink}>{devLink}</a>
            </p>
          )}
        </div>

        <form className={styles.card} onSubmit={onSubmitCode}>
          <label htmlFor={`${idPrefix}-code`}>{t("loginPage.codeLabel")}</label>
          <p className={styles.hintTight}>{t("loginPage.codeHint")}</p>
          <input
            id={`${idPrefix}-code`}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="AB2K9X"
            className={styles.codeInput}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          {codeError && <p className={styles.error}>{codeError}</p>}
          {devCode && (
            <p className={styles.subtitle}>{t("loginPage.devModeCodeLabel", { code: devCode })}</p>
          )}
          <button className={styles.primaryBtn} type="submit" disabled={verifying}>
            {verifying ? t("loginPage.verifying") : t("loginPage.submitCode")}
          </button>
        </form>
      </>
    );
  }

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <label htmlFor={`${idPrefix}-email`}>{t("loginPage.emailLabel")}</label>
      <input
        id={`${idPrefix}-email`}
        type="email"
        required
        autoComplete="email"
        placeholder={t("loginPage.emailPlaceholder")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && <p className={styles.error}>{error}</p>}
      <button className={styles.primaryBtn} type="submit" disabled={sending}>
        {sending ? t("loginPage.sending") : t("loginPage.submitEmail")}
      </button>
    </form>
  );
}
