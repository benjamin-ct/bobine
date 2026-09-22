import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "../../../core/context/ThemeContext.tsx";
import { Disclosure } from "../../../shared/components/index.ts";
import styles from "./SettingsPanel.module.css";

const THEMES: Theme[] = ["dark", "light"];

// Réglage "Thème" : déplacé du bouton bascule de la NavBar vers le profil,
// au même endroit que langue et région (review sur la carte Trello).
export default function ThemeSettings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <Disclosure summary={t("themeSettings.title")} meta={t(`themeSettings.${theme}`)}>
      <p>{t("themeSettings.description")}</p>
      <select
        className={styles.select}
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
      >
        {THEMES.map((value) => (
          <option key={value} value={value}>
            {t(`themeSettings.${value}`)}
          </option>
        ))}
      </select>
    </Disclosure>
  );
}
