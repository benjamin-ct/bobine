import { useEffect, useState } from "react";
import { getCountries, getLanguages } from "../../../core/api/tmdb.ts";
import type { Country, Language } from "../../../core/types/tmdb.ts";
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

  return (
    <div className={styles.group}>
      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className={styles.select}
      >
        <option value="">Tous les pays</option>
        {countries.map((c) => (
          <option key={c.iso_3166_1} value={c.iso_3166_1}>
            {c.english_name}
          </option>
        ))}
      </select>

      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className={styles.select}
      >
        <option value="">Toutes les langues</option>
        {languages.map((l) => (
          <option key={l.iso_639_1} value={l.iso_639_1}>
            {l.name || l.english_name}
          </option>
        ))}
      </select>
    </div>
  );
}
