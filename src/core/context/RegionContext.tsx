import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_REGION, getTheatricalStatusIndex, type TheatricalIndex } from "../api/tmdb.ts";

interface RegionContextValue {
  region: string;
  regionName: string | null;
  getTheatricalStatus: (movieId: number) => "upcoming" | "in_theaters" | null;
}

const RegionContext = createContext<RegionContextValue | null>(null);

// Nom du pays en français à partir de son code ISO 3166-1 (ex. "FR" ->
// "France"), via l'API native du navigateur — pas d'appel réseau
// supplémentaire, pas de liste à maintenir.
const regionDisplayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["fr"], { type: "region" })
    : null;

export function regionName(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  try {
    return regionDisplayNames?.of(code) || code;
  } catch {
    return code;
  }
}

// Détecte le pays du visiteur via /api/region (déduit par Cloudflare au
// niveau du edge, voir worker/index.ts — aucune permission navigateur,
// aucun service tiers). Utilisé pour adapter "Où regarder" et la liste des
// plateformes disponibles à la région réelle de la personne, plutôt que de
// supposer la France pour tout le monde.
export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState(DEFAULT_REGION);
  // Index "au cinéma"/"bientôt" (voir getTheatricalStatusIndex) consulté
  // par MediaCard pour la pastille de grille, sans appel réseau par carte.
  // Vide tant que le premier chargement n'est pas terminé.
  const [theatricalIndex, setTheatricalIndex] = useState<TheatricalIndex>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/region")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("region fetch failed"))))
      .then((data: { country?: string }) => {
        if (!cancelled && data.country) {
          setRegion(data.country);
        }
      })
      .catch(() => {
        // Repli silencieux sur DEFAULT_REGION (déjà l'état initial) — ex.
        // en dev local où /api/region n'existe pas (Vite seul, pas de Worker).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTheatricalStatusIndex(region)
      .then((index) => {
        if (!cancelled) {
          setTheatricalIndex(index);
        }
      })
      .catch(() => {
        // Repli silencieux : les cartes affichent alors simplement l'absence
        // de pastille "au cinéma", pas une erreur bloquante.
      });
    return () => {
      cancelled = true;
    };
  }, [region]);

  const getTheatricalStatus = useCallback(
    (movieId: number) => theatricalIndex.get(movieId) || null,
    [theatricalIndex]
  );

  const value = useMemo(
    () => ({ region, regionName: regionName(region), getTheatricalStatus }),
    [region, getTheatricalStatus]
  );

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion(): RegionContextValue {
  const ctx = useContext(RegionContext);
  if (!ctx) {
    throw new Error("useRegion doit être utilisé dans un RegionProvider");
  }
  return ctx;
}
