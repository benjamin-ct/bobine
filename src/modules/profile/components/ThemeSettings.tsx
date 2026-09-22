import { useTranslation } from "react-i18next";
import { useTheme, type ThemePreference } from "../../../core/context/ThemeContext.tsx";
import { Disclosure } from "../../../shared/components/index.ts";
import styles from "./SettingsPanel.module.css";

const PREFERENCES: ThemePreference[] = ["light", "dark", "auto"];

// Réglage "Thème" : déplacé du bouton bascule de la NavBar vers le profil,
// au même endroit que langue et région (review sur la carte Trello). Passé
// d'un choix binaire clair/sombre à trois boutons incluant "auto" (suit le
// thème de l'appareil), demandé lors d'une 2e review sur la même carte.
export default function ThemeSettings() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <Disclosure summary={t("themeSettings.title")} meta={t(`themeSettings.${preference}`)}>
      <p>{t("themeSettings.description")}</p>
      <div className={styles.segmented} role="tablist" aria-label={t("themeSettings.title")}>
        {PREFERENCES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={preference === value}
            className={preference === value ? styles.segActive : ""}
            onClick={() => setPreference(value)}
          >
            {t(`themeSettings.${value}`)}
          </button>
        ))}
      </div>
    </Disclosure>
  );
}
