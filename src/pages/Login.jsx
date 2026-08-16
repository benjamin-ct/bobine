import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { status, requestLink, verifyCode } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState(null);
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState(null);

  if (status === "authenticated") {
    return <Navigate to="/ma-liste" replace />;
  }

  async function onSubmit(e) {
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
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function onSubmitCode(e) {
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
      setCodeError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="page page--narrow">
      <h1>Se connecter</h1>
      <p className="page-subtitle">
        Connecte-toi pour retrouver ta liste "envie de voir" / "déjà vu" sur tous tes appareils. Pas
        de mot de passe : on t'envoie un lien de connexion par email.
      </p>

      {sent ? (
        <>
          <div className="auth-card">
            <p>
              📬 Un lien de connexion a été envoyé à <strong>{email.trim()}</strong>.
            </p>
            <p className="page-subtitle">
              Vérifie ta boîte mail (et tes spams) — le lien est valable 15 minutes.
            </p>
            {devLink && (
              <p className="page-subtitle">
                Mode développement (pas d'email configuré) : <a href={devLink}>{devLink}</a>
              </p>
            )}
          </div>

          <form className="auth-card" onSubmit={onSubmitCode}>
            <label htmlFor="login-code">Ou entre le code reçu par email</label>
            <p className="page-subtitle" style={{ marginTop: -6, marginBottom: 0 }}>
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
              className="auth-card__code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            {codeError && <p className="auth-card__error">{codeError}</p>}
            {devCode && <p className="page-subtitle">Mode développement : code {devCode}</p>}
            <button className="btn btn--primary" type="submit" disabled={verifying}>
              {verifying ? "Vérification…" : "Valider le code"}
            </button>
          </form>
        </>
      ) : (
        <form className="auth-card" onSubmit={onSubmit}>
          <label htmlFor="login-email">Adresse email</label>
          <input
            id="login-email"
            type="email"
            required
            placeholder="toi@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="auth-card__error">{error}</p>}
          <button className="btn btn--primary" type="submit" disabled={sending}>
            {sending ? "Envoi…" : "Recevoir mon lien de connexion"}
          </button>
        </form>
      )}
    </div>
  );
}
