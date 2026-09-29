import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";

export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

// Seul le français (langue par défaut et de repli) est dans le bundle
// initial : les autres langues sont des chunks séparés, chargés par
// ensureLocaleLoaded avant d'être activées (audit H6).
const LOCALE_LOADERS: Partial<Record<Locale, () => Promise<unknown>>> = {
  en: () => import("./locales/en.json").then((m) => m.default),
};

i18next.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

// Charge les traductions de `locale` si ce n'est pas déjà fait. En cas
// d'échec (hors ligne, chunk introuvable), l'interface reste en français.
export async function ensureLocaleLoaded(locale: Locale): Promise<void> {
  if (locale === DEFAULT_LOCALE || i18next.hasResourceBundle(locale, "translation")) {
    return;
  }
  const load = LOCALE_LOADERS[locale];
  if (!load) {
    return;
  }
  try {
    const translation = await load();
    i18next.addResourceBundle(locale, "translation", translation);
  } catch {
    // Repli silencieux sur fallbackLng.
  }
}

export default i18next;
