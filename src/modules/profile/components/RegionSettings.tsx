import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCountries } from "../../../core/api/tmdb.ts";
import type { Country } from "../../../core/types/tmdb.ts";
import { regionName, useRegion } from "../../../core/context/RegionContext.tsx";
import { useLocale } from "../../../core/context/LocaleContext.tsx";
import { Disclosure } from "../../../shared/components/index.ts";
import styles from "./SettingsPanel.module.css";

// Réglage "Région" : choix manuel du pays utilisé pour "Où regarder", le
// filtre plateformes et les dates de sortie régionales — en repli sur la
// géolocalisation /api/region tant qu'aucun choix n'a été fait (voir
// RegionContext.tsx), pour que le profil reste sur la région de base de
// l'utilisateur même en VPN ou en déplacement.
export default function RegionSettings() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { region, regionName: activeRegionName, setRegion } = useRegion();
  const [countries, setCountries] = useState<Country[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    let cancelled = false;
    setStatus("loading");
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
  }, [loaded]);

  // Nom localisé (locale active) plutôt que le english_name figé renvoyé
  // par TMDB — même principe que AdvancedFilters.
  const localizedCountries = useMemo(
    () =>
      countries
        .map((c) => ({ ...c, displayName: regionName(c.iso_3166_1, locale) || c.english_name }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, locale)),
    [countries, locale]
  );

  return (
    <Disclosure
      summary={t("regionSettings.title")}
      meta={activeRegionName ?? region}
      defaultOpen={false}
      onToggle={(open) => open && setLoaded(true)}
    >
      <p>{t("regionSettings.description")}</p>
      {status === "loading" && <p>{t("common.loading")}</p>}
      {status === "error" && <p>{t("regionSettings.loadError")}</p>}
      {status === "success" && (
        <select
          className={styles.select}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          {localizedCountries.map((c) => (
            <option key={c.iso_3166_1} value={c.iso_3166_1}>
              {c.displayName}
            </option>
          ))}
        </select>
      )}
    </Disclosure>
  );
}
