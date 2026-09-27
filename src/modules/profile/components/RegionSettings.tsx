import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCountries } from "../../../core/api/tmdb.ts";
import type { Country } from "../../../core/types/tmdb.ts";
import { loadStoredRegion, regionName, useRegion } from "../../../core/context/RegionContext.tsx";
import { useLocale } from "../../../core/context/LocaleContext.tsx";
import { Icon } from "../../../shared/components/index.ts";
import { SettingsRow } from "./SettingsGroup.tsx";
import styles from "./SettingsPanel.module.css";

const AUTOMATIC = "";

// Réglage "Région" : choix manuel du pays utilisé pour "Où regarder", le
// filtre plateformes et les dates de sortie régionales — en repli sur la
// géolocalisation /api/region tant qu'aucun choix n'a été fait (voir
// RegionContext.tsx), pour que le profil reste sur la région de base de
// l'utilisateur même en VPN ou en déplacement. Sans choix manuel, le menu
// affiche « Automatique · <pays détecté> ».
export default function RegionSettings() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { region, regionName: activeRegionName, setRegion } = useRegion();
  const [countries, setCountries] = useState<Country[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  // Relu à chaque rendu : setRegion le pose en même temps qu'il change
  // `region`, ce qui redéclenche ce rendu.
  const isAutomatic = loadStoredRegion() === null;

  useEffect(() => {
    let cancelled = false;
    getCountries()
      .then((list) => {
        if (!cancelled) {
          setCountries(list);
          setStatus("success");
        }
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Nom localisé (locale active) plutôt que le english_name figé renvoyé
  // par TMDB — même principe que AdvancedFilters.
  const localizedCountries = useMemo(
    () =>
      countries
        .map((c) => ({ ...c, displayName: regionName(c.iso_3166_1, locale) || c.english_name }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, locale)),
    [countries, locale]
  );

  const activeName = activeRegionName ?? region;

  return (
    <SettingsRow label={t("regionSettings.title")} description={t("regionSettings.description")}>
      {status === "error" ? (
        <p className={styles.error}>{t("regionSettings.loadError")}</p>
      ) : (
        <div className={styles.selectWrap}>
          <Icon name="globe" size={17} />
          <select
            className={styles.select}
            aria-label={t("regionSettings.title")}
            value={isAutomatic ? AUTOMATIC : region}
            disabled={status === "loading"}
            onChange={(e) => e.target.value !== AUTOMATIC && setRegion(e.target.value)}
          >
            {isAutomatic && (
              <option value={AUTOMATIC}>
                {t("regionSettings.automatic", { country: activeName })}
              </option>
            )}
            {status === "loading" && !isAutomatic && <option value={region}>{activeName}</option>}
            {localizedCountries.map((c) => (
              <option key={c.iso_3166_1} value={c.iso_3166_1}>
                {c.displayName}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} />
        </div>
      )}
      <p className={styles.hint}>
        {t(isAutomatic ? "regionSettings.automaticHint" : "regionSettings.manualHint")}
      </p>
    </SettingsRow>
  );
}
