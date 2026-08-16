import { useEffect, useState } from "react";
import { getCountries, getLanguages } from "../api/tmdb";

// Filtres "légers" pays de production / langue originale, pour les pages où
// le panneau complet de filtres avancés (année, note, durée...) serait de
// trop — voir Nouveautés et Prochainement.
export default function CountryLanguageFilter({ country, setCountry, language, setLanguage }) {
  const [countries, setCountries] = useState([]);
  const [languages, setLanguages] = useState([]);

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
    <div className="filter-bar__group" style={{ marginBottom: 18 }}>
      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="filter-bar__select"
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
        className="filter-bar__select"
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
