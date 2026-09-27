import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES } from "../../../core/i18n/i18n.ts";
import { useLocale } from "../../../core/context/LocaleContext.tsx";
import { SlidingIndicator } from "../../../shared/components/index.ts";
import { SettingsRow } from "./SettingsGroup.tsx";
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
    <SettingsRow
      label={t("languageSettings.title")}
      description={t("languageSettings.description")}
    >
      <div className={styles.segmented} role="radiogroup" aria-label={t("languageSettings.title")}>
        <SlidingIndicator activeKey={locale} />
        {SUPPORTED_LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={locale === code}
            lang={code}
            className={locale === code ? styles.segActive : ""}
            onClick={() => setLocale(code)}
          >
            {t(`languageSettings.${code}`)}
          </button>
        ))}
      </div>
    </SettingsRow>
  );
}
