import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { searchMulti } from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import PersonCard from "../components/PersonCard";
import { Loading, ErrorMessage, EmptyState } from "../components/StateMessage";

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [titles, setTitles] = useState([]);
  const [people, setPeople] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!query) {
      setTitles([]);
      setPeople([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    searchMulti(query)
      .then((data) => {
        if (cancelled) {
          return;
        }
        const results = data.results || [];
        setTitles(
          results.filter((item) => item.media_type === "movie" || item.media_type === "tv")
        );
        setPeople(results.filter((item) => item.media_type === "person"));
        setStatus("success");
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const isEmpty = titles.length === 0 && people.length === 0;

  return (
    <div className="page">
      <h1>Résultats pour « {query} »</h1>
      {status === "loading" && <Loading />}
      {status === "error" && <ErrorMessage error={error} />}
      {status === "success" && isEmpty && <EmptyState label="Aucun résultat." />}

      {status === "success" && people.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h3>Acteurs & réalisateurs</h3>
          <div className="person-grid">
            {people.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        </section>
      )}

      {status === "success" && titles.length > 0 && (
        <section>
          {people.length > 0 && <h3>Films & séries</h3>}
          <div className="media-grid">
            {titles.map((item) => (
              <MediaCard
                key={`${item.media_type}:${item.id}`}
                item={{ ...item, mediaType: item.media_type }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
