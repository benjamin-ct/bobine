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
import { useMembersOnly } from "./MembersOnlyContext.tsx";
import { logWarn } from "../logger.ts";
import type { MediaType } from "../types/tmdb.ts";

// Rappels « Me prévenir » (page Prochainement) : indépendants de l'envie de
// voir, rattachés au compte et stockés côté serveur (migration 0014,
// worker/reminders.ts) — c'est le scheduler qui prévient le jour de la
// sortie puis à l'arrivée sur une plateforme, pas l'appareil.
export interface ReminderInput {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  /** AAAA-MM-JJ, date de sortie affichée au moment de l'ajout. */
  date?: string;
}

interface RemindersContextValue {
  hasReminder: (mediaType: MediaType, id: number) => boolean;
  toggleReminder: (item: ReminderInput) => void;
}

const RemindersContext = createContext<RemindersContextValue | null>(null);

function makeKey(mediaType: MediaType, id: number): string {
  return `${mediaType}:${id}`;
}

async function sendReminderChange(
  method: "PUT" | "DELETE",
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch("/api/reminders", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

export function RemindersProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { requireMember } = useMembersOnly();
  const [keys, setKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (status !== "authenticated") {
      setKeys(new Set());
      return;
    }
    let cancelled = false;
    fetch("/api/reminders")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { reminders?: { mediaType: MediaType; tmdbId: number }[] }) => {
        if (!cancelled) {
          setKeys(new Set((data.reminders || []).map((r) => makeKey(r.mediaType, r.tmdbId))));
        }
      })
      .catch((err) => logWarn("Seancy : chargement des rappels échoué.", err));
    return () => {
      cancelled = true;
    };
  }, [status]);

  const hasReminder = useCallback(
    (mediaType: MediaType, id: number) => keys.has(makeKey(mediaType, id)),
    [keys]
  );

  // Mise à jour optimiste, annulée si le serveur refuse.
  const toggleReminder = useCallback(
    (item: ReminderInput) => {
      if (!requireMember()) {
        return;
      }
      const key = makeKey(item.mediaType, item.id);
      const wasOn = keys.has(key);
      const apply = (on: boolean) =>
        setKeys((prev) => {
          const next = new Set(prev);
          if (on) {
            next.add(key);
          } else {
            next.delete(key);
          }
          return next;
        });
      apply(!wasOn);
      const request = wasOn
        ? sendReminderChange("DELETE", { key })
        : sendReminderChange("PUT", {
            mediaType: item.mediaType,
            tmdbId: item.id,
            title: item.title,
            posterPath: item.posterPath,
            releaseDate: item.date,
          });
      request.catch((err) => {
        logWarn("Seancy : mise à jour du rappel échouée.", err);
        apply(wasOn);
      });
    },
    [keys, requireMember]
  );

  const value = useMemo(() => ({ hasReminder, toggleReminder }), [hasReminder, toggleReminder]);

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders(): RemindersContextValue {
  const ctx = useContext(RemindersContext);
  if (!ctx) {
    throw new Error("useReminders doit être utilisé dans un RemindersProvider.");
  }
  return ctx;
}
