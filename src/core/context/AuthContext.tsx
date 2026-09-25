import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { getRecaptchaToken } from "../lib/recaptcha.ts";
import { clearAccountDataFromDevice } from "../lib/accountStorage.ts";
import { useLocale } from "./LocaleContext.tsx";
import { syncClientHeaders, useLiveSyncConnection, useLiveSyncEvent } from "../sync/liveSync.ts";
import { usePushAccountLink } from "../sync/pushAccountLink.ts";

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
  // Slug du lien de partage public du profil (/u/<slug>), `null` tant que
  // le profil est privé — voir ProfileShareCard.
  shareSlug: string | null;
  requestLink: (email: string) => Promise<RequestLinkResult>;
  verify: (token: string) => Promise<VerifyResult>;
  verifyCode: (code: string) => Promise<VerifyResult>;
  logout: () => Promise<void>;
  // Enregistre le nom affiché côté serveur (save manuel, pas de synchro
  // automatique — voir AccountCard) et met à jour l'état local à l'identique.
  updateDisplayName: (displayName: string) => Promise<void>;
  // Active/désactive le partage public du profil ; désactiver invalide
  // définitivement le lien existant.
  setProfileShared: (enabled: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Toutes les routes /api/* sont servies par le même Worker que l'app (même
// origine), donc les cookies de session partent automatiquement avec
// `credentials: "same-origin"` (comportement par défaut de fetch) — pas
// besoin de `credentials: "include"` ni de gestion CORS.

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);

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
    // Évite l'appel réseau pour tout visiteur qui n'a jamais eu de session
    // (dont l'intégralité du trafic anonyme et des crawlers/bots — voir
    // worker/auth.ts, AUTH_HINT_COOKIE) : sans ce cookie compagnon, une
    // réponse 401 est de toute façon garantie.
    if (!pinnedRef.current && !document.cookie.includes("bobine_auth=1")) {
      setEmail(null);
      setDisplayName(null);
      setShareSlug(null);
      setStatus("anonymous");
      return Promise.resolve();
    }
    return fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) {
          throw new Error("not authenticated");
        }
        return res.json() as Promise<{
          email: string;
          displayName: string | null;
          shareSlug: string | null;
        }>;
      })
      .then((data) => {
        setEmail(data.email);
        setDisplayName(data.displayName ?? null);
        setShareSlug(data.shareSlug ?? null);
        setStatus("authenticated");
        pinnedRef.current = true;
      })
      .catch(() => {
        if (pinnedRef.current) {
          return;
        }
        setEmail(null);
        setDisplayName(null);
        setShareSlug(null);
        setStatus("anonymous");
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Synchro temps réel entre appareils du compte (voir core/sync/liveSync.ts) :
  // ouverte ici, une seule fois pour toute l'app. Le nom affiché modifié
  // depuis un autre appareil est rechargé via /api/auth/me.
  useLiveSyncConnection(status === "authenticated");
  useLiveSyncEvent("display-name", () => {
    refresh();
  });
  // Notifications : rattache/détache l'abonnement push de l'appareil au
  // compte à chaque connexion/déconnexion (voir core/sync/pushAccountLink.ts).
  usePushAccountLink(status);

  // Demande un lien de connexion par email. Renvoie la réponse du serveur
  // (peut contenir `devLink` en local sans service d'email configuré).
  const requestLink = useCallback(
    async (emailToSend: string): Promise<RequestLinkResult> => {
      const recaptchaToken = await getRecaptchaToken("request_link");
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailToSend, recaptchaToken, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("auth.requestLinkError"));
      }
      return data;
    },
    [locale, t]
  );

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
      setDisplayName(data.displayName ?? null);
      setShareSlug(data.shareSlug ?? null);
      setStatus("authenticated");
      return data;
    },
    []
  );

  const verify = useCallback(
    (token: string) => verifyWith({ token }, t("auth.verify.expiredLink")),
    [verifyWith, t]
  );

  const verifyCode = useCallback(
    (code: string) => verifyWith({ code }, t("auth.verify.expiredCode")),
    [verifyWith, t]
  );

  const logout = useCallback(async () => {
    pinnedRef.current = false;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Plus rien du compte ne doit rester dans le navigateur : on efface les
    // données stockées puis on recharge l'app sur l'accueil, ce qui vide
    // aussi l'état gardé en mémoire par les contextes (bibliothèque,
    // listes, réglages) — sans quoi leurs effets de persistance le
    // réécriraient dans localStorage au prochain changement.
    clearAccountDataFromDevice();
    window.location.replace("/");
  }, []);

  // Save manuel uniquement (voir AccountCard, bouton "Enregistrer") : pas de
  // synchro automatique/temps réel — décision produit explicite pour le
  // ticket #45.
  const updateDisplayNameCallback = useCallback(
    async (newDisplayName: string): Promise<void> => {
      const res = await fetch("/api/account/display-name", {
        method: "PATCH",
        headers: { "content-type": "application/json", ...syncClientHeaders() },
        body: JSON.stringify({ displayName: newDisplayName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("auth.updateDisplayNameError"));
      }
      setDisplayName(data.displayName);
    },
    [t]
  );

  const setProfileShared = useCallback(
    async (enabled: boolean): Promise<void> => {
      const res = await fetch("/api/account/share", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("auth.updateShareError"));
      }
      setShareSlug(data.shareSlug ?? null);
    },
    [t]
  );

  return (
    <AuthContext.Provider
      value={{
        status,
        email,
        displayName,
        shareSlug,
        requestLink,
        verify,
        verifyCode,
        logout,
        updateDisplayName: updateDisplayNameCallback,
        setProfileShared,
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
