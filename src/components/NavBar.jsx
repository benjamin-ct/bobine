import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function NavBar() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  function onSubmit(e) {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/recherche?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <NavLink to="/" className="navbar__brand">🎬 Bobine</NavLink>
        <nav className="navbar__links">
          <NavLink to="/" end>Découvrir</NavLink>
          <NavLink to="/aleatoire">Aléatoire</NavLink>
          <NavLink to="/ma-liste">Ma liste</NavLink>
        </nav>
        <form className="navbar__search" onSubmit={onSubmit}>
          <input
            type="search"
            placeholder="Rechercher un film, une série…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
      </div>
    </header>
  );
}
