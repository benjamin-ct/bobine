import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { posterUrl } from "../api/tmdb";
import { useLibrary } from "../context/LibraryContext";
import Stats from "../components/Stats";

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
        <div>
          <p className="list-row__title">{item.title}</p>
          <p className="list-row__meta">{item.mediaType === "movie" ? "Film" : "Série"} · {year}</p>
        </div>
      </Link>
      <div className="list-row__actions">
        <button
          className={`icon-btn ${inWatchlist ? "icon-btn--active" : ""}`}
          onClick={() => toggleWatchlist(item)}
          title="Envie de voir"
        >
          {inWatchlist ? "★" : "☆"}
        </button>
        <button
          className={`icon-btn ${watched ? "icon-btn--active" : ""}`}
          onClick={() => toggleWatched(item)}
          title="Marquer comme vu"
        >
          {watched ? "✔" : "○"}
        </button>
        <Link
          className="icon-btn"
          to={`/media/${item.mediaType}/${item.id}#recommendations`}
          title="Titres similaires"
        >
          🔁
        </Link>
      </div>
    </div>
  );
}

export default function MyList() {
  const { watched, watchlist, exportData, importData } = useLibrary();
  const [tab, setTab] = useState("watchlist");
  const [importMessage, setImportMessage] = useState(null);
  const fileInputRef = useRef(null);
  const items = tab === "watchlist" ? watchlist : watched;

  function handleExport() {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bobine-export-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { watchedCount, watchlistCount } = importData(reader.result);
        setImportMessage(`Import réussi : ${watchedCount} titre(s) vu(s), ${watchlistCount} envie(s) fusionné(s).`);
      } catch {
        setImportMessage("Le fichier n'est pas un export Bobine valide.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="page">
      <div className="mylist-header">
        <h1>Ma liste</h1>
        <div className="mylist-actions">
          <button className="btn" onClick={handleExport}>⬇ Exporter</button>
          <button className="btn" onClick={handleImportClick}>⬆ Importer</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>
      </div>
      {importMessage && <p className="page-subtitle">{importMessage}</p>}

      <div className="filter-bar__group" style={{ marginBottom: 20 }}>
        <button className={tab === "watchlist" ? "chip chip--active" : "chip"} onClick={() => setTab("watchlist")}>
          Envie de voir ({watchlist.length})
        </button>
        <button className={tab === "watched" ? "chip chip--active" : "chip"} onClick={() => setTab("watched")}>
          Déjà vu ({watched.length})
        </button>
      </div>

      {tab === "watched" && <Stats watched={watched} />}

      {items.length === 0 ? (
        <p className="page-subtitle">
          {tab === "watchlist"
            ? "Ta liste d'envies est vide. Ajoute des titres depuis les fiches ou le tirage aléatoire."
            : "Tu n'as encore rien marqué comme vu."}
        </p>
      ) : (
        <div className="list-rows">
          {items.map((item) => (
            <Row key={`${item.mediaType}:${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
