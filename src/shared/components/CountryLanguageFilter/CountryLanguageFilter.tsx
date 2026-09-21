import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCountries, getLanguages } from "../../../core/api/tmdb.ts";
import type { Country, Language } from "../../../core/types/tmdb.ts";
import { regionName } from "../../../core/context/RegionContext.tsx";
import { useLocale } from "../../../core/context/LocaleContext.tsx";
import styles from "./CountryLanguageFilter.module.css";

interface CountryLanguageFilterProps {
  country: string;
  setCountry: (v: string) => void;
  language: string;
  setLanguage: (v: string) => void;
}

// Filtres "légers" pays de production / langue originale, pour les pages où
// le panneau complet de filtres avancés (année, note, durée...) serait de
// trop — voir Nouveautés et Prochainement.
export default function CountryLanguageFilter({
  country,
  setCountry,
  language,
  setLanguage,
}: CountryLanguageFilterProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [countries, setCountries] = useState<Country[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCountries()
      .then((list) => !cancelled && setCountries(list))
      .catch(() => !cancelled && setCountries([]));
    getLanguages()
      .then((list) => !cancelled && setLanguages(list))
      .catch(() => !cancelled && setLanguages([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Nom localisé (locale active) plutôt que le english_name figé renvoyé par
  // TMDB, avec repli sur ce dernier si Intl.DisplayNames est indisponible.
  const localizedCountries = useMemo(
    () =>
      countries
        .map((c) => ({ ...c, displayName: regionName(c.iso_3166_1, locale) || c.english_name }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, locale)),
    [countries, locale]
  );

  return (
    <div className={styles.group}>
      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className={styles.select}
      >
        <option value="">{t("countryLanguageFilter.allCountries")}</option>
        {localizedCountries.map((c) => (
          <option key={c.iso_3166_1} value={c.iso_3166_1}>
            {c.displayName}
          </option>
        ))}
      </select>

      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className={styles.select}
      >
        <option value="">{t("countryLanguageFilter.allLanguages")}</option>
        {languages.map((l) => (
          <option key={l.iso_639_1} value={l.iso_639_1}>
            {l.name || l.english_name}
          </option>
        ))}
      </select>
    </div>
  );
}
