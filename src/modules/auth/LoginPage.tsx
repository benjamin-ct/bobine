import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../core/context/AuthContext.tsx";
import styles from "./AuthPages.module.css";

export default function LoginPage() {
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
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
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
      setCodeError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1>Se connecter</h1>
      <p className={styles.subtitle}>
        Connecte-toi pour retrouver ta liste "envie de voir" / "déjà vu" sur tous tes appareils. Pas
        de mot de passe : on t'envoie un lien de connexion par email.
      </p>

      {sent ? (
        <>
          <div className={styles.card}>
            <p>
              📬 Un lien de connexion a été envoyé à <strong>{email.trim()}</strong>.
            </p>
            <p className={styles.subtitle}>
              Vérifie ta boîte mail (et tes spams) — le lien est valable 15 minutes.
            </p>
            {devLink && (
              <p className={styles.subtitle}>
                Mode développement (pas d'email configuré) : <a href={devLink}>{devLink}</a>
              </p>
            )}
          </div>

          <form className={styles.card} onSubmit={onSubmitCode}>
            <label htmlFor="login-code">Ou entre le code reçu par email</label>
            <p className={styles.hintTight}>
              Si Bobine est installée sur ton écran d'accueil, le lien risque de s'ouvrir dans le
              navigateur au lieu de l'app — le code, lui, fonctionne toujours ici.
            </p>
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
            {devCode && <p className={styles.subtitle}>Mode développement : code {devCode}</p>}
            <button className={styles.primaryBtn} type="submit" disabled={verifying}>
              {verifying ? "Vérification…" : "Valider le code"}
            </button>
          </form>
        </>
      ) : (
        <form className={styles.card} onSubmit={onSubmit}>
          <label htmlFor="login-email">Adresse email</label>
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
            {sending ? "Envoi…" : "Recevoir mon lien de connexion"}
          </button>
        </form>
      )}
    </div>
  );
}
