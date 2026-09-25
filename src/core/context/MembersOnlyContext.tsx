import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext.tsx";

interface MembersOnlyContextValue {
  // À appeler au début de toute action utilisateur qui écrit dans la
  // bibliothèque (vu/à voir, note, épisodes, listes perso...). Renvoie
  // `true` si l'action peut continuer ; sinon ouvre la modale "action
  // réservée aux membres connectés" (voir modules/auth/MembersOnlyDialog)
  // et renvoie `false` — l'appelant abandonne alors l'action.
  requireMember: () => boolean;
  promptOpen: boolean;
  closePrompt: () => void;
}

const MembersOnlyContext = createContext<MembersOnlyContextValue | null>(null);

export function MembersOnlyProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [promptOpen, setPromptOpen] = useState(false);

  // Seul "anonymous" bloque : pendant "loading" (session en cours de
  // vérification via /api/auth/me pour un visiteur qui a déjà un cookie de
  // session), l'action passe et sera synchronisée une fois la session
  // confirmée, plutôt que d'afficher à tort la modale à un membre connecté.
  const requireMember = useCallback(() => {
    if (status !== "anonymous") {
      return true;
    }
    setPromptOpen(true);
    return false;
  }, [status]);

  const closePrompt = useCallback(() => setPromptOpen(false), []);

  // Connexion réussie depuis la modale (code validé) : plus rien à bloquer.
  useEffect(() => {
    if (status === "authenticated") {
      setPromptOpen(false);
    }
  }, [status]);

  const value = useMemo(
    () => ({ requireMember, promptOpen, closePrompt }),
    [requireMember, promptOpen, closePrompt]
  );

  return <MembersOnlyContext.Provider value={value}>{children}</MembersOnlyContext.Provider>;
}

export function useMembersOnly(): MembersOnlyContextValue {
  const ctx = useContext(MembersOnlyContext);
  if (!ctx) {
    throw new Error("useMembersOnly doit être utilisé dans un MembersOnlyProvider");
  }
  return ctx;
}
