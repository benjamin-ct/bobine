import { NavLink, Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { searchMulti, posterUrl } from "../../../core/api/tmdb.ts";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import { useTheme } from "../../../core/context/ThemeContext.tsx";
import type { SearchMultiResult } from "../../../core/types/tmdb.ts";
import styles from "./NavBar.module.css";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const MAX_LIVE_RESULTS = 8;

const NAV_LINKS = [
  { to: "/", label: "Découvrir", end: true },
  { to: "/nouveautes", label: "Nouveautés" },
  { to: "/prochainement", label: "Prochainement" },
  { to: "/aleatoire", label: "Aléatoire" },
  { to: "/ma-liste", label: "Ma liste" },
];

function ReelIcon() {
  return (
    <svg
      className={styles.reel}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="6.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17.4" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: "dark" | "light" }) {
  return theme === "light" ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function SearchResults({
  results,
  status,
  query,
  onPick,
}: {
  results: SearchMultiResult[];
  status: "idle" | "loading" | "success" | "error";
  query: string;
  onPick: (path: string) => void;
}) {
  return (
    <div className={styles.results} role="listbox">
      {status === "loading" && <p className={styles.hint}>Recherche…</p>}
      {status === "success" && results.length === 0 && (
        <p className={styles.hint}>Aucun résultat.</p>
      )}
      {results.map((item) => {
        if (item.media_type === "person") {
          const path = `/personne/${item.id}`;
          return (
            <Link
              key={`person-${item.id}`}
              to={path}
              className={styles.item}
              onClick={() => onPick(path)}
            >
              {item.profile_path ? (
                <img
                  src={posterUrl(item.profile_path, "w92") ?? undefined}
                  alt={item.name}
                  className={styles.avatar}
                />
              ) : (
                <div className={`${styles.avatar} ${styles.avatarEmpty}`} />
              )}
              <div>
                <p className={styles.itemTitle}>{item.name}</p>
                <p className={styles.itemMeta}>Acteur/Actrice, réalisateur·rice…</p>
              </div>
            </Link>
          );
        }
        const title = item.title || item.name || "";
        const date = item.release_date || item.first_air_date;
        const path = `/media/${item.media_type}/${item.id}`;
        return (
          <Link
            key={`${item.media_type}-${item.id}`}
            to={path}
            className={styles.item}
            onClick={() => onPick(path)}
          >
            {item.poster_path ? (
              <img
                src={posterUrl(item.poster_path, "w92") ?? undefined}
                alt={title}
                className={styles.poster}
              />
            ) : (
              <div className={`${styles.poster} ${styles.posterEmpty}`} />
            )}
            <div>
              <p className={styles.itemTitle}>{title}</p>
              <p className={styles.itemMeta}>
                {item.media_type === "movie" ? "Film" : "Série"}
                {date ? ` · ${date.slice(0, 4)}` : ""}
              </p>
            </div>
          </Link>
        );
      })}
      {results.length > 0 && (
        <Link
          to={`/recherche?q=${encodeURIComponent(query)}`}
          className={styles.allResults}
          onClick={() => onPick("")}
        >
          Voir tous les résultats pour « {query} » →
        </Link>
      )}
    </div>
  );
}

export default function NavBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMultiResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { status: authStatus, email, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

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
            .filter(
              (item) =>
                item.media_type === "movie" ||
                item.media_type === "tv" ||
                item.media_type === "person"
            )
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

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      return;
    }
    setOpen(false);
    navigate(`/recherche?q=${encodeURIComponent(q)}`);
  }

  function goTo(path: string) {
    setOpen(false);
    setQuery("");
    if (path) {
      navigate(path);
    }
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onNavClick() {
    scrollTop();
    setMenuOpen(false);
  }

  return (
    <header className={styles.topnav}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand} onClick={onNavClick}>
          <ReelIcon />
          Bobine
        </Link>

        <nav className={styles.tabs} aria-label="Navigation principale">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={onNavClick}
              className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ""}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className={`${styles.search} ${styles.desktopOnly}`} ref={wrapperRef}>
          <form onSubmit={onSubmit}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              placeholder="Film, série, acteur, réalisateur…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              aria-label="Rechercher"
            />
          </form>
          {open && query.trim().length >= MIN_QUERY_LENGTH && (
            <SearchResults results={results} status={status} query={query.trim()} onPick={goTo} />
          )}
        </div>

        <button
          type="button"
          className={`${styles.iconBtn} ${styles.desktopOnly}`}
          onClick={toggleTheme}
          aria-label="Basculer le thème clair / sombre"
          title="Thème clair / sombre"
        >
          <ThemeIcon theme={theme} />
        </button>

        <Link
          to="/profil"
          className={`${styles.iconBtn} ${styles.desktopOnly}`}
          aria-label="Profil"
          title="Profil"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </Link>

        {authStatus === "authenticated" ? (
          <button
            type="button"
            className={`${styles.textBtn} ${styles.desktopOnly}`}
            onClick={logout}
            title={email ?? undefined}
          >
            Déconnexion
          </button>
        ) : (
          <Link
            to="/connexion"
            className={`${styles.textBtn} ${styles.desktopOnly}`}
            onClick={onNavClick}
          >
            Connexion
          </Link>
        )}

        <button
          type="button"
          className={`${styles.iconBtn} ${styles.mobileOnly}`}
          onClick={toggleTheme}
          aria-label="Basculer le thème clair / sombre"
          title="Thème clair / sombre"
        >
          <ThemeIcon theme={theme} />
        </button>

        <button
          type="button"
          className={styles.hamburger}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {menuOpen && (
        <div className={styles.mobileNav}>
          <label className={styles.mobileSearch}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              placeholder="Film, série, acteur, réalisateur…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {query.trim().length >= MIN_QUERY_LENGTH && (
            <SearchResults
              results={results}
              status={status}
              query={query.trim()}
              onPick={(p) => {
                goTo(p);
                setMenuOpen(false);
              }}
            />
          )}
          <nav className={styles.mobileLinks}>
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={onNavClick}
                className={({ isActive }) =>
                  `${styles.mobileLink} ${isActive ? styles.mobileLinkActive : ""}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink to="/profil" onClick={onNavClick} className={styles.mobileLink}>
              Profil
            </NavLink>
          </nav>
          <div className={styles.mobileFoot}>
            {authStatus === "authenticated" ? (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
              >
                Déconnexion
              </button>
            ) : (
              <Link to="/connexion" className={styles.primaryBtn} onClick={onNavClick}>
                Connexion
              </Link>
            )}
          </div>
        </div>
      )}
      <div className="perfStrip" aria-hidden="true" />
    </header>
  );
}
