import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import i18n, { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "../i18n/i18n.ts";

// Langue de l'interface, indépendante du réglage des plateformes de
// streaming (voir FavoriteProvidersContext, qui reste piloté par
// RegionContext/le pays) : les deux réglages ne doivent jamais se piloter
// l'un l'autre (cf. carte Trello "Internationalisation de l'application").
// Détection auto à la première visite (langue du navigateur), avec
// possibilité de override manuel persisté ensuite.
const STORAGE_KEY = "bobine.locale";

function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const base = candidate?.slice(0, 2).toLowerCase();
    if (base && isSupportedLocale(base)) {
      return base;
    }
  }
  return DEFAULT_LOCALE;
}

function loadInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) {
      return stored;
    }
  } catch {
    // localStorage indisponible (mode privé strict...) : repli silencieux.
  }
  return detectBrowserLocale();
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(loadInitialLocale);

  useEffect(() => {
    i18n.changeLanguage(locale);
    document.documentElement.setAttribute("lang", locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Repli silencieux : la langue reste appliquée pour cette session,
      // simplement pas mémorisée pour la prochaine visite.
    }
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale doit être utilisé dans un LocaleProvider");
  }
  return ctx;
}
