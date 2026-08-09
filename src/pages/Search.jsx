import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { searchMulti } from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import { Loading, ErrorMessage, EmptyState } from "../components/StateMessage";

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    searchMulti(query)
      .then((data) => {
        if (cancelled) return;
        const filtered = (data.results || []).filter(
          (item) => item.media_type === "movie" || item.media_type === "tv"
        );
        setResults(filtered);
        setStatus("success");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="page">
      <h1>Résultats pour « {query} »</h1>
      {status === "loading" && <Loading />}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "success" && results.length === 0 && <EmptyState label="Aucun résultat." />}
      {status === "success" && results.length > 0 && (
        <div className="media-grid">
          {results.map((item) => (
            <MediaCard key={item.id} item={{ ...item, mediaType: item.media_type }} />
          ))}
        </div>
      )}
    </div>
  );
}
