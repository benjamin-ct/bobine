import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getRecaptchaToken } from "../lib/recaptcha";

const AuthContext = createContext(null);

// Toutes les routes /api/* sont servies par le même Worker que l'app (même
// origine), donc les cookies de session partent automatiquement avec
// `credentials: "same-origin"` (comportement par défaut de fetch) — pas
// besoin de `credentials: "include"` ni de gestion CORS.

export function AuthProvider({ children }) {
  // status: "loading" | "authenticated" | "anonymous"
  const [status, setStatus] = useState("loading");
  const [email, setEmail] = useState(null);

  // `verify()` (consommation du jeton sur /auth/verify) et `refresh()` (la
  // vérification passive "suis-je déjà connecté" au montage) peuvent
  // toutes les deux vouloir mettre à jour ce state autour du même
  // chargement de page. Les effets des composants enfants (VerifyAuth) se
  // déclenchent avant ceux de leur parent (AuthProvider) au montage, donc
  // le refresh() passif part AVANT que le cookie de session ne soit posé
  // par verify() — sans garde, sa réponse 401 écraserait ensuite le
  // résultat pourtant correct de verify() en arrivant après lui. Dès que
  // verify() réussit, on "épingle" l'état authentifié : refresh() ne peut
  // plus le rétrograder (mais reste libre de le faire progresser depuis
  // "loading", au cas où verify() échoue et qu'on retombe sur une session
  // déjà valide par ailleurs).
  const pinnedRef = useRef(false);

  const refresh = useCallback(() => {
    return fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) {
          throw new Error("not authenticated");
        }
        return res.json();
      })
      .then((data) => {
        setEmail(data.email);
        setStatus("authenticated");
        pinnedRef.current = true;
      })
      .catch(() => {
        if (pinnedRef.current) {
          return;
        }
        setEmail(null);
        setStatus("anonymous");
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Demande un lien de connexion par email. Renvoie la réponse du serveur
  // (peut contenir `devLink` en local sans service d'email configuré).
  const requestLink = useCallback(async (emailToSend) => {
    const recaptchaToken = await getRecaptchaToken("request_link");
    const res = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailToSend, recaptchaToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Impossible d'envoyer le lien de connexion.");
    }
    return data;
  }, []);

  // Consomme le jeton (lien cliqué) ou le code (saisi à la main — voir
  // Login.jsx, utile quand le lien s'ouvre dans le navigateur au lieu de
  // l'app installée sur l'écran d'accueil, notamment sur iOS) et établit
  // la session.
  const verifyWith = useCallback(async (body, fallbackError) => {
    const recaptchaToken = await getRecaptchaToken("verify");
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, recaptchaToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || fallbackError);
    }
    pinnedRef.current = true;
    setEmail(data.email);
    setStatus("authenticated");
    return data;
  }, []);

  const verify = useCallback(
    (token) => verifyWith({ token }, "Ce lien de connexion n'est plus valide."),
    [verifyWith]
  );

  const verifyCode = useCallback(
    (code) => verifyWith({ code }, "Ce code n'est plus valide."),
    [verifyWith]
  );

  const logout = useCallback(async () => {
    pinnedRef.current = false;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setEmail(null);
    setStatus("anonymous");
  }, []);

  return (
    <AuthContext.Provider value={{ status, email, requestLink, verify, verifyCode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé dans un AuthProvider");
  }
  return ctx;
}
