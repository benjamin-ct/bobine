import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../core/context/AuthContext.tsx";
import styles from "./AuthPages.module.css";

export default function LoginPage() {
  const { t } = useTranslation();
  const { status, requestLink, verifyCode } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Navigate to="/ma-liste" replace />;
  }

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
      // La redirection se fait via le <Navigate> ci-dessus, une fois que
      // le statut d'auth passe à "authenticated".
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : t("loginPage.unknownError"));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1>{t("loginPage.title")}</h1>
      <p className={styles.subtitle}>{t("loginPage.subtitle")}</p>

      {sent ? (
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
            <label htmlFor="login-code">{t("loginPage.codeLabel")}</label>
            <p className={styles.hintTight}>{t("loginPage.codeHint")}</p>
            <input
              id="login-code"
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
              <p className={styles.subtitle}>
                {t("loginPage.devModeCodeLabel", { code: devCode })}
              </p>
            )}
            <button className={styles.primaryBtn} type="submit" disabled={verifying}>
              {verifying ? t("loginPage.verifying") : t("loginPage.submitCode")}
            </button>
          </form>
        </>
      ) : (
        <form className={styles.card} onSubmit={onSubmit}>
          <label htmlFor="login-email">{t("loginPage.emailLabel")}</label>
          <input
            id="login-email"
            type="email"
            required
            placeholder="toi@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.primaryBtn} type="submit" disabled={sending}>
            {sending ? t("loginPage.sending") : t("loginPage.submitEmail")}
          </button>
        </form>
      )}
    </div>
  );
}
