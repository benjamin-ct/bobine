import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { posterUrl, getGenres } from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";
import Stats from "../components/Stats";
import NotificationSettings from "../components/NotificationSettings";

const MYLIST_SORT_FIELDS = [
  { value: "addedAt", label: "Date d'ajout" },
  { value: "title", label: "Titre" },
  { value: "year", label: "Année de sortie" },
  { value: "rating", label: "Note" },
];

// Petit menu à cases à cocher pour ajouter/retirer un titre d'une ou
// plusieurs listes personnalisées — masqué tant qu'aucune liste n'existe,
// pas de bouton "+" inutile pour qui n'utilise pas cette fonctionnalité.
function AddToListMenu({ item }) {
  const { customLists, isInList, addToList, removeFromList } = useLibrary();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (customLists.length === 0) return null;

  return (
    <div className="add-to-list" ref={wrapperRef}>
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)} title="Ajouter à une liste">
        +
      </button>
      {open && (
        <div className="add-to-list__menu">
          {customLists.map((list) => {
            const checked = isInList(list.id, item.mediaType, item.id);
            return (
              <label key={list.id} className="add-to-list__item">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => (checked ? removeFromList : addToList)(list.id, item.mediaType, item.id)}
                />
                {list.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ item }) {
  const { toggleWatched, toggleWatchlist, isWatched, isInWatchlist } = useLibrary();
  const watched = isWatched(item.mediaType, item.id);
  const inWatchlist = isInWatchlist(item.mediaType, item.id);
  const year = item.date ? item.date.slice(0, 4) : "—";

  return (
    <div className="list-row">
      <Link to={`/media/${item.mediaType}/${item.id}`} className="list-row__link">
        {item.posterPath ? (
          <img src={posterUrl(item.posterPath, "w92")} alt={item.title} />
        ) : (
          <div className="list-row__no-poster" />
        )}
        <div className="list-row__info">
          <p className="list-row__title">{item.title}</p>
          <p className="list-row__meta">
            {item.mediaType === "movie" ? "Film" : "Série"} · {year}
            {item.rating && <span className="rating-badge"> · ★ {item.rating}/10</span>}
          </p>
        </div>
      </Link>
      <div className="list-row__actions">
        <button
          className={`icon-btn ${inWatchlist ? "icon-btn--gold" : ""}`}
          onClick={() => toggleWatchlist(item)}
          title="Envie de voir"
        >
          {inWatchlist ? "★" : "☆"}
        </button>
        <button
          className={`icon-btn ${watched ? "icon-btn--green" : ""}`}
          onClick={() => toggleWatched(item)}
          title="Marquer comme vu"
        >
          {watched ? "✔" : "○"}
        </button>
        {watched && (
          <Link
            className="icon-btn icon-btn--text"
            to={`/media/${item.mediaType}/${item.id}#recommendations`}
            title="Trouver des titres similaires"
          >
            Similaire
          </Link>
        )}
        <AddToListMenu item={item} />
      </div>
    </div>
  );
}

function emptyMessageFor(tab, activeList) {
  if (tab === "watchlist") return "Ta liste d'envies est vide. Ajoute des titres depuis les fiches ou le tirage aléatoire.";
  if (tab === "watched") return "Tu n'as encore rien marqué comme vu.";
  return `La liste « ${activeList?.name} » est vide pour l'instant. Ajoute des titres depuis le bouton "+" sur chaque ligne.`;
}

export default function MyList() {
  const { watched, watchlist, customLists, createList, renameList, deleteList, getListItems } = useLibrary();
  const [tab, setTab] = useState("watchlist");
  const [genreMap, setGenreMap] = useState({});

  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [renamingList, setRenamingList] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const [filterType, setFilterType] = useState("");
  const [filterGenre, setFilterGenre] = useState("");
  const [filterYearMin, setFilterYearMin] = useState("");
  const [filterYearMax, setFilterYearMax] = useState("");
  const [sortBy, setSortBy] = useState("addedAt");
  const [sortDirection, setSortDirection] = useState("desc");

  const activeList = customLists.find((l) => l.id === tab);
  const items = tab === "watchlist" ? watchlist : tab === "watched" ? watched : getListItems(tab);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getGenres("movie"), getGenres("tv")])
      .then(([m, t]) => {
        if (cancelled) return;
        const map = {};
        for (const g of [...(m.genres || []), ...(t.genres || [])]) map[g.id] = g.name;
        setGenreMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Un genre valable dans l'onglet précédent n'a pas forcément de sens dans
  // le nouveau (watchlist/déjà vu/une autre liste) — on repart à "tous les
  // genres" plutôt que de garder un filtre qui viderait silencieusement la
  // vue.
  useEffect(() => {
    setFilterGenre("");
  }, [tab]);

  // Uniquement les genres réellement présents dans l'onglet actif, pas les
  // ~19 genres TMDB au complet — évite de proposer des genres qui ne
  // filtreraient jamais rien ici.
  const availableGenres = useMemo(() => {
    const ids = new Set();
    for (const item of items) {
      for (const gid of item.genreIds || []) ids.add(gid);
    }
    return [...ids]
      .map((id) => ({ id, name: genreMap[id] || "…" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, genreMap]);

  const visibleItems = useMemo(() => {
    let result = items;
    if (filterType) result = result.filter((item) => item.mediaType === filterType);
    if (filterGenre) result = result.filter((item) => item.genreIds?.includes(Number(filterGenre)));
    if (filterYearMin) result = result.filter((item) => item.date && Number(item.date.slice(0, 4)) >= Number(filterYearMin));
    if (filterYearMax) result = result.filter((item) => item.date && Number(item.date.slice(0, 4)) <= Number(filterYearMax));

    const sorted = [...result].sort((a, b) => {
      let diff;
      if (sortBy === "title") diff = a.title.localeCompare(b.title);
      else if (sortBy === "year") diff = (a.date || "").localeCompare(b.date || "");
      // Pas de note = classé en dernier, quel que soit le sens du tri.
      else if (sortBy === "rating") diff = (a.rating ?? -1) - (b.rating ?? -1);
      else diff = (a.addedAt || 0) - (b.addedAt || 0);
      return sortDirection === "asc" ? diff : -diff;
    });
    return sorted;
  }, [items, filterType, filterGenre, filterYearMin, filterYearMax, sortBy, sortDirection]);

  function submitNewList(e) {
    e.preventDefault();
    const id = createList(newListName);
    if (id) {
      setNewListName("");
      setCreatingList(false);
      setTab(id);
    }
  }

  function startRename() {
    setRenameValue(activeList.name);
    setRenamingList(true);
  }

  function submitRename(e) {
    e.preventDefault();
    renameList(tab, renameValue);
    setRenamingList(false);
  }

  function handleDeleteList() {
    if (window.confirm(`Supprimer la liste « ${activeList.name} » ? Les titres eux-mêmes resteront dans « Envie de voir »/« Déjà vu ».`)) {
      deleteList(tab);
      setTab("watchlist");
    }
  }

  return (
    <div className="page">
      <h1>Ma liste</h1>

      <NotificationSettings />

      <div className="filter-bar__group my-list__tabs">
        <button className={tab === "watchlist" ? "chip chip--active" : "chip"} onClick={() => setTab("watchlist")}>
          Envie de voir ({watchlist.length})
        </button>
        <button className={tab === "watched" ? "chip chip--active" : "chip"} onClick={() => setTab("watched")}>
          Déjà vu ({watched.length})
        </button>
        {customLists.map((list) => (
          <button key={list.id} className={tab === list.id ? "chip chip--active" : "chip"} onClick={() => setTab(list.id)}>
            {list.name} ({list.itemKeys.length})
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setCreatingList((v) => !v)}>
          + Nouvelle liste
        </button>
      </div>

      {creatingList && (
        <form className="my-list__inline-form" onSubmit={submitNewList}>
          <input
            type="text"
            placeholder="Nom de la liste (ex. Halloween)"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            autoFocus
            maxLength={60}
          />
          <button type="submit" className="btn">Créer</button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCreatingList(false);
              setNewListName("");
            }}
          >
            Annuler
          </button>
        </form>
      )}

      {activeList && !renamingList && (
        <div className="my-list__list-actions">
          <button type="button" className="icon-btn icon-btn--text" onClick={startRename}>
            ✏️ Renommer
          </button>
          <button type="button" className="icon-btn icon-btn--text" onClick={handleDeleteList}>
            🗑️ Supprimer la liste
          </button>
        </div>
      )}
      {activeList && renamingList && (
        <form className="my-list__inline-form" onSubmit={submitRename}>
          <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus maxLength={60} />
          <button type="submit" className="btn">Renommer</button>
          <button type="button" className="btn" onClick={() => setRenamingList(false)}>
            Annuler
          </button>
        </form>
      )}

      {tab === "watched" && <Stats watched={watched} />}

      {items.length > 0 && (
        <div className="filter-bar">
          <div className="filter-bar__group">
            <button className={filterType === "" ? "chip chip--active" : "chip"} onClick={() => setFilterType("")}>
              Tous
            </button>
            <button className={filterType === "movie" ? "chip chip--active" : "chip"} onClick={() => setFilterType("movie")}>
              Films
            </button>
            <button className={filterType === "tv" ? "chip chip--active" : "chip"} onClick={() => setFilterType("tv")}>
              Séries
            </button>
          </div>

          {availableGenres.length > 0 && (
            <select className="filter-bar__select" value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
              <option value="">Tous les genres</option>
              {availableGenres.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}

          <div className="advanced-filters__range my-list__year-range">
            <input
              type="number"
              placeholder="Année min"
              value={filterYearMin}
              onChange={(e) => setFilterYearMin(e.target.value)}
            />
            <span>–</span>
            <input
              type="number"
              placeholder="Année max"
              value={filterYearMax}
              onChange={(e) => setFilterYearMax(e.target.value)}
            />
          </div>

          <div className="sort-control">
            <select className="filter-bar__select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {MYLIST_SORT_FIELDS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="sort-direction-btn"
              onClick={() => setSortDirection((d) => (d === "desc" ? "asc" : "desc"))}
              title={sortDirection === "desc" ? "Décroissant (cliquer pour croissant)" : "Croissant (cliquer pour décroissant)"}
            >
              {sortDirection === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="page-subtitle">{emptyMessageFor(tab, activeList)}</p>
      ) : visibleItems.length === 0 ? (
        <p className="page-subtitle">Aucun titre ne correspond à ces filtres.</p>
      ) : (
        <div className="list-rows">
          {visibleItems.map((item) => (
            <Row key={`${item.mediaType}:${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
