import { NavLink, Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { searchMulti, posterUrl } from "../api/tmdb";
import { useAuth } from "../context/AuthContext";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const MAX_LIVE_RESULTS = 8;

export default function NavBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const { status: authStatus, email, logout } = useAuth();

  // Recherche en direct, avec un léger anti-rebond pour ne pas spammer TMDB
  // à chaque frappe.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    const timeoutId = setTimeout(() => {
      searchMulti(trimmed)
        .then((data) => {
          const filtered = (data.results || [])
            .filter((item) => item.media_type === "movie" || item.media_type === "tv" || item.media_type === "person")
            .slice(0, MAX_LIVE_RESULTS);
          setResults(filtered);
          setStatus("success");
          setOpen(true);
        })
        .catch(() => {
          setResults([]);
          setStatus("error");
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Ferme le menu au clic en dehors, ou à l'échap.
  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function onSubmit(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    navigate(`/recherche?q=${encodeURIComponent(q)}`);
  }

  function goTo(path) {
    setOpen(false);
    setQuery("");
    navigate(path);
  }

  // Cliquer sur le logo ou un onglet remonte toujours en haut de la page,
  // y compris quand on est déjà sur cette page (auquel cas la navigation
  // ne se déclenche pas et ne le ferait pas toute seule).
  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Utilisé sur les liens de nav : remonte en haut et referme le menu
  // mobile (utile puisqu'un clic sur un onglet ne démonte pas la navbar).
  function onNavClick() {
    scrollTop();
    setMenuOpen(false);
  }

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <div className="navbar__top">
          <NavLink to="/" className="navbar__brand" onClick={onNavClick}>🎬 Bobine</NavLink>
          <button
            type="button"
            className="navbar__toggle"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
        <nav className={`navbar__links${menuOpen ? " navbar__links--open" : ""}`}>
          <NavLink to="/" end onClick={onNavClick}>Découvrir</NavLink>
          <NavLink to="/nouveautes" onClick={onNavClick}>Nouveautés</NavLink>
          <NavLink to="/prochainement" onClick={onNavClick}>Prochainement</NavLink>
          <NavLink to="/aleatoire" onClick={onNavClick}>Aléatoire</NavLink>
          <NavLink to="/ma-liste" onClick={onNavClick}>Ma liste</NavLink>
        </nav>
        <div className="navbar__search" ref={wrapperRef}>
          <form onSubmit={onSubmit}>
            <input
              type="search"
              placeholder="Rechercher un film, une série…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
            />
          </form>

          {open && query.trim().length >= MIN_QUERY_LENGTH && (
            <div className="live-search">
              {status === "loading" && <p className="live-search__hint">Recherche…</p>}
              {status === "success" && results.length === 0 && (
                <p className="live-search__hint">Aucun résultat.</p>
              )}
              {results.map((item) => {
                if (item.media_type === "person") {
                  return (
                    <Link
                      key={`person-${item.id}`}
                      to={`/personne/${item.id}`}
                      className="live-search__item"
                      onClick={() => goTo(`/personne/${item.id}`)}
                    >
                      {item.profile_path ? (
                        <img src={posterUrl(item.profile_path, "w92")} alt={item.name} className="live-search__avatar" />
                      ) : (
                        <div className="live-search__avatar live-search__avatar--empty" />
                      )}
                      <div>
                        <p className="live-search__title">{item.name}</p>
                        <p className="live-search__meta">Acteur/Actrice, réalisateur·rice…</p>
                      </div>
                    </Link>
                  );
                }
                const title = item.title || item.name;
                const date = item.release_date || item.first_air_date;
                const path = `/media/${item.media_type}/${item.id}`;
                return (
                  <Link key={`${item.media_type}-${item.id}`} to={path} className="live-search__item" onClick={() => goTo(path)}>
                    {item.poster_path ? (
                      <img src={posterUrl(item.poster_path, "w92")} alt={title} className="live-search__poster" />
                    ) : (
                      <div className="live-search__poster live-search__poster--empty" />
                    )}
                    <div>
                      <p className="live-search__title">{title}</p>
                      <p className="live-search__meta">
                        {item.media_type === "movie" ? "Film" : "Série"}
                        {date ? ` · ${date.slice(0, 4)}` : ""}
                      </p>
                    </div>
                  </Link>
                );
              })}
              {results.length > 0 && (
                <Link to={`/recherche?q=${encodeURIComponent(query.trim())}`} className="live-search__all" onClick={() => setOpen(false)}>
                  Voir tous les résultats pour « {query.trim()} » →
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="navbar__account">
          {authStatus === "authenticated" && (
            <>
              <span className="navbar__account-email" title={email}>{email}</span>
              <button type="button" className="icon-btn icon-btn--text" onClick={logout}>
                Déconnexion
              </button>
            </>
          )}
          {authStatus === "anonymous" && (
            <Link to="/connexion" className="icon-btn icon-btn--text" onClick={onNavClick}>
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
