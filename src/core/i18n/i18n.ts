import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

// Ressources vides pour l'instant : ce ticket met en place le socle
// (détection, changement de langue, persistance) uniquement — l'extraction
// et la traduction de l'ensemble des chaînes du front est un sous-ticket
// séparé, livré dans une PR dédiée (cf. carte Trello "Internationalisation
// de l'application"). i18next retombe sur la clé passée à t() tant qu'une
// ressource n'existe pas, donc l'app reste fonctionnelle (en français en
// dur, comme aujourd'hui) en attendant.
i18next.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18next;
