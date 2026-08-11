import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

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
        if (!res.ok) throw new Error("not authenticated");
        return res.json();
      })
      .then((data) => {
        setEmail(data.email);
        setStatus("authenticated");
        pinnedRef.current = true;
      })
      .catch(() => {
        if (pinnedRef.current) return;
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
    const res = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailToSend }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Impossible d'envoyer le lien de connexion.");
    return data;
  }, []);

  // Consomme le jeton reçu par email, établit la session.
  const verify = useCallback(async (token) => {
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Ce lien de connexion n'est plus valide.");
    pinnedRef.current = true;
    setEmail(data.email);
    setStatus("authenticated");
    return data;
  }, []);

  const logout = useCallback(async () => {
    pinnedRef.current = false;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setEmail(null);
    setStatus("anonymous");
  }, []);

  return (
    <AuthContext.Provider value={{ status, email, requestLink, verify, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
