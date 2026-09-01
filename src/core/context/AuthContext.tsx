import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getRecaptchaToken } from "../lib/recaptcha.ts";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface RequestLinkResult {
  ok: true;
  devLink?: string;
  devCode?: string;
}

interface VerifyResult {
  ok: true;
  email: string;
}

interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  // Nom affiché (ticket #45) : source de vérité côté D1 (colonne
  // users.display_name), chargé avec le reste de la session via
  // /api/auth/me. `null` tant qu'aucune valeur n'a jamais été enregistrée.
  displayName: string | null;
  requestLink: (email: string) => Promise<RequestLinkResult>;
  verify: (token: string) => Promise<VerifyResult>;
  verifyCode: (code: string) => Promise<VerifyResult>;
  logout: () => Promise<void>;
  // Enregistre le nom affiché côté serveur (save manuel, pas de synchro
  // automatique — voir AccountCard) et met à jour l'état local à l'identique.
  updateDisplayName: (displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Toutes les routes /api/* sont servies par le même Worker que l'app (même
// origine), donc les cookies de session partent automatiquement avec
// `credentials: "same-origin"` (comportement par défaut de fetch) — pas
// besoin de `credentials: "include"` ni de gestion CORS.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

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
        return res.json() as Promise<{ email: string; displayName: string | null }>;
      })
      .then((data) => {
        setEmail(data.email);
        setDisplayName(data.displayName ?? null);
        setStatus("authenticated");
        pinnedRef.current = true;
      })
      .catch(() => {
        if (pinnedRef.current) {
          return;
        }
        setEmail(null);
        setDisplayName(null);
        setStatus("anonymous");
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Demande un lien de connexion par email. Renvoie la réponse du serveur
  // (peut contenir `devLink` en local sans service d'email configuré).
  const requestLink = useCallback(async (emailToSend: string): Promise<RequestLinkResult> => {
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
  // Login, utile quand le lien s'ouvre dans le navigateur au lieu de
  // l'app installée sur l'écran d'accueil, notamment sur iOS) et établit
  // la session.
  const verifyWith = useCallback(
    async (
      body: { token?: string; code?: string },
      fallbackError: string
    ): Promise<VerifyResult> => {
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
    },
    []
  );

  const verify = useCallback(
    (token: string) => verifyWith({ token }, "Ce lien de connexion n'est plus valide."),
    [verifyWith]
  );

  const verifyCode = useCallback(
    (code: string) => verifyWith({ code }, "Ce code n'est plus valide."),
    [verifyWith]
  );

  const logout = useCallback(async () => {
    pinnedRef.current = false;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setEmail(null);
    setDisplayName(null);
    setStatus("anonymous");
  }, []);

  // Save manuel uniquement (voir AccountCard, bouton "Enregistrer") : pas de
  // synchro automatique/temps réel — décision produit explicite pour le
  // ticket #45.
  const updateDisplayNameCallback = useCallback(async (newDisplayName: string): Promise<void> => {
    const res = await fetch("/api/account/display-name", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: newDisplayName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Impossible d'enregistrer le nom affiché.");
    }
    setDisplayName(data.displayName);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        email,
        displayName,
        requestLink,
        verify,
        verifyCode,
        logout,
        updateDisplayName: updateDisplayNameCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé dans un AuthProvider");
  }
  return ctx;
}
