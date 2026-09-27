import { useTranslation } from "react-i18next";
import { useTheme, type ThemePreference } from "../../../core/context/ThemeContext.tsx";
import { SettingsRow } from "./SettingsGroup.tsx";
import styles from "./SettingsPanel.module.css";

const PREFERENCES: ThemePreference[] = ["dark", "light", "auto"];

// Réglage "Thème" : déplacé du bouton bascule de la NavBar vers le profil,
// au même endroit que langue et région (review sur la carte Trello). Trois
// choix dont "auto" (suit le thème de l'appareil) ; nouvelle DA 8/10 : une
// carte avec aperçu miniature et bouton radio par choix.
export default function ThemeSettings() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <SettingsRow label={t("themeSettings.title")} description={t("themeSettings.description")}>
      <div className={styles.themes} role="radiogroup" aria-label={t("themeSettings.title")}>
        {PREFERENCES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={preference === value}
            className={`${styles.themeCard} ${preference === value ? styles.themeOn : ""}`}
            onClick={() => setPreference(value)}
          >
            <span className={styles.themePreview} data-theme={value} aria-hidden="true">
              <span />
              <span />
            </span>
            <span className={styles.themeLabel}>
              <span className={styles.radio} aria-hidden="true" />
              {t(`themeSettings.${value}`)}
            </span>
          </button>
        ))}
      </div>
    </SettingsRow>
  );
}
