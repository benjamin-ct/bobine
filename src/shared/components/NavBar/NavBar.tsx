import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchMulti, posterUrl } from "../../../core/api/tmdb.ts";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import { useRegion } from "../../../core/context/RegionContext.tsx";
import { setMediaPreview } from "../../lib/mediaPreviewCache.ts";
import type { SearchMultiResult } from "../../../core/types/tmdb.ts";
import TicketLogo from "../TicketLogo/TicketLogo.tsx";
import Icon, { type IconName } from "../Icon/Icon.tsx";
import styles from "./NavBar.module.css";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const MAX_LIVE_RESULTS = 8;

const NAV_LINKS: { to: string; key: string; icon: IconName; end?: boolean }[] = [
  { to: "/", key: "discover", icon: "compass", end: true },
  { to: "/nouveautes", key: "newReleases", icon: "sparkle" },
  { to: "/prochainement", key: "comingSoon", icon: "calendar" },
  { to: "/aleatoire", key: "random", icon: "shuffle" },
];

function SearchResults({
  results,
  status,
  query,
  onPick,
  inline,
  onViewAll,
}: {
  results: SearchMultiResult[];
  status: "idle" | "loading" | "success" | "error";
  query: string;
  onPick: (path: string) => void;
  inline?: boolean;
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  // Alimente le cache de préview (voir mediaPreviewCache) pour que la fiche
  // puisse préafficher affiche/titre/date pendant son chargement.
  useEffect(() => {
    for (const item of results) {
      if (item.media_type === "movie" || item.media_type === "tv") {
        setMediaPreview(item.media_type, item.id, {
          title: item.title || item.name || "",
          posterPath: item.poster_path ?? null,
          date: item.region_release_date || item.release_date || item.first_air_date,
        });
      }
    }
  }, [results]);

  return (
    <div className={`${styles.results} ${inline ? styles.resultsInline : ""}`} role="listbox">
      {status === "loading" && <p className={styles.hint}>{t("navBar.searching")}</p>}
      {status === "success" && results.length === 0 && (
        <p className={styles.hint}>{t("navBar.noResults")}</p>
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
                <p className={styles.itemMeta}>{t("navBar.personRoleHint")}</p>
              </div>
            </Link>
          );
        }
        const title = item.title || item.name || "";
        const date = item.region_release_date || item.release_date || item.first_air_date;
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
                {item.media_type === "movie"
                  ? t("navBar.mediaTypeMovie")
                  : t("navBar.mediaTypeSeries")}
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
          onClick={onViewAll}
        >
          {t("navBar.viewAllResults", { query })}
        </Link>
      )}
    </div>
  );
}

export default function NavBar() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMultiResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const { status: authStatus } = useAuth();
  const { region } = useRegion();
  const authenticated = authStatus === "authenticated";

  // Hauteur réelle de l'en-tête collant, publiée en --topnav-height pour
  // les éléments collants posés juste dessous (mois de Prochainement...) :
  // elle varie selon la largeur et l'ouverture du panneau de recherche.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) {
      return;
    }
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--topnav-height", `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--topnav-height");
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const timeoutId = setTimeout(() => {
      searchMulti(trimmed, 1, region)
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
  }, [query, region]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Le panneau de recherche mobile se referme dès qu'on change de page
  // (résultat choisi, onglet du bas, lien de la page…).
  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      return;
    }
    setOpen(false);
    setSearchOpen(false);
    navigate(`/recherche?q=${encodeURIComponent(q)}`);
  }

  function goTo(path: string) {
    setOpen(false);
    setSearchOpen(false);
    setQuery("");
    if (path) {
      navigate(path);
    }
  }

  function onNavClick() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <header className={styles.topnav} ref={headerRef}>
        <div className={styles.inner}>
          <Link to="/" className={styles.brand} onClick={onNavClick}>
            <TicketLogo className={styles.logo} />
            Seancy
          </Link>

          <nav
            className={`${styles.tabs} ${styles.desktopOnly}`}
            aria-label={t("navBar.mainNavAriaLabel")}
          >
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={onNavClick}
                className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ""}`}
              >
                {t(`navBar.navLinks.${link.key}`)}
              </NavLink>
            ))}
          </nav>

          <div className={`${styles.search} ${styles.desktopOnly}`} ref={wrapperRef}>
            <form onSubmit={onSubmit} role="search">
              <Icon name="search" />
              <input
                type="search"
                placeholder={t("navBar.searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                aria-label={t("navBar.searchAriaLabel")}
              />
            </form>
            {open && query.trim().length >= MIN_QUERY_LENGTH && (
              <SearchResults
                results={results}
                status={status}
                query={query.trim()}
                onPick={goTo}
                onViewAll={() => setOpen(false)}
              />
            )}
          </div>

          <button
            type="button"
            className={`${styles.iconBtn} ${styles.mobileOnly} ${searchOpen ? styles.iconBtnActive : ""}`}
            onClick={() => setSearchOpen((v) => !v)}
            aria-label={t("navBar.searchAriaLabel")}
            aria-expanded={searchOpen}
            aria-controls="mobile-search"
          >
            <Icon name="search" />
          </button>

          {/* Profil réservé aux membres connectés (voir ProfilePage) : un
              visiteur anonyme n'y a aucun accès visible, seulement
              « Connexion ». La déconnexion se fait depuis Profil › Compte. */}
          {authenticated ? (
            <NavLink
              to="/profil"
              className={({ isActive }) =>
                `${styles.iconBtn} ${styles.desktopOnly} ${isActive ? styles.iconBtnActive : ""}`
              }
              aria-label={t("navBar.profileAriaLabel")}
              title={t("navBar.profileTitle")}
            >
              <Icon name="user" strokeWidth={1.8} />
            </NavLink>
          ) : (
            <Link to="/connexion" className={styles.loginBtn} onClick={onNavClick}>
              {t("navBar.login")}
            </Link>
          )}
        </div>

        {searchOpen && (
          <div id="mobile-search" className={`${styles.mobileSearchPanel} ${styles.mobileOnly}`}>
            <form onSubmit={onSubmit} role="search" className={styles.mobileSearch}>
              <Icon name="search" />
              <input
                type="search"
                autoFocus
                placeholder={t("navBar.searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("navBar.searchAriaLabel")}
              />
            </form>
            {query.trim().length >= MIN_QUERY_LENGTH && (
              <SearchResults
                results={results}
                status={status}
                query={query.trim()}
                inline
                onPick={goTo}
                onViewAll={() => setSearchOpen(false)}
              />
            )}
          </div>
        )}
        <div className="perfStrip perfStripTop" aria-hidden="true" />
      </header>

      {/* Barre d'onglets mobile (masquée au-delà de 860px). « Ma liste » n'y
          figure pas : elle vit dans Profil. */}
      <nav className={styles.tabbar} aria-label={t("navBar.tabBarAriaLabel")}>
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onNavClick}
            className={({ isActive }) =>
              `${styles.tabbarItem} ${isActive ? styles.tabbarItemActive : ""}`
            }
          >
            <Icon name={link.icon} size={22} strokeWidth={1.8} />
            <span>{t(`navBar.tabLinks.${link.key}`)}</span>
          </NavLink>
        ))}
        {authenticated && (
          <NavLink
            to="/profil"
            onClick={onNavClick}
            className={({ isActive }) =>
              `${styles.tabbarItem} ${isActive ? styles.tabbarItemActive : ""}`
            }
          >
            <Icon name="user" size={22} strokeWidth={1.8} />
            <span>{t("navBar.profileTitle")}</span>
          </NavLink>
        )}
      </nav>
    </>
  );
}
