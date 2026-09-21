import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type Locale } from "../../../core/i18n/i18n.ts";
import { useLocale } from "../../../core/context/LocaleContext.tsx";
import { Disclosure } from "../../../shared/components/index.ts";
import styles from "./SettingsPanel.module.css";

// Réglage "Langue" : déplacé du bouton bascule de la NavBar vers le profil
// (carte Trello "Internationalisation de l'application"), au même endroit
// que la région et les autres préférences synchronisées par compte — voir
// LocaleAccountSync.tsx pour la persistance (localStorage hors connexion,
// compte une fois connecté).
export default function LanguageSettings() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();

  return (
    <Disclosure summary={t("languageSettings.title")} meta={t(`languageSettings.${locale}`)}>
      <p>{t("languageSettings.description")}</p>
      <select
        className={styles.select}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`languageSettings.${code}`)}
          </option>
        ))}
      </select>
    </Disclosure>
  );
}
