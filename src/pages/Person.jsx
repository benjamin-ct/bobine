import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { posterUrl, getPerson, getPersonCredits } from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import { Loading, ErrorMessage, EmptyState } from "../components/StateMessage";

const DIRECTING_JOBS = new Set(["Director", "Writer", "Screenplay", "Creator"]);

function dedupeByMedia(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.media_type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sortByDateDesc(items) {
  return items.slice().sort((a, b) => {
    const dateA = a.release_date || a.first_air_date || "";
    const dateB = b.release_date || b.first_air_date || "";
    return dateB.localeCompare(dateA);
  });
}

export default function Person() {
  const { id } = useParams();
  const [person, setPerson] = useState(null);
  const [credits, setCredits] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([getPerson(id), getPersonCredits(id)])
      .then(([p, c]) => {
        if (cancelled) return;
        setPerson(p);
        setCredits(c);
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
  }, [id]);

  if (status === "loading") return <div className="page"><Loading /></div>;
  if (status === "error") return <div className="page"><ErrorMessage error={error} /></div>;
  if (!person) return null;

  const asActor = sortByDateDesc(dedupeByMedia(credits?.cast || []));
  const asCrew = sortByDateDesc(
    dedupeByMedia((credits?.crew || []).filter((c) => DIRECTING_JOBS.has(c.job)))
  );

  return (
    <div className="page">
      <Link to="/" className="back-link" style={{ marginTop: 0, marginBottom: 20 }}>← Retour</Link>

      <div className="person-header">
        {person.profile_path && (
          <img className="person-header__photo" src={posterUrl(person.profile_path, "w342")} alt={person.name} />
        )}
        <div>
          <h1>{person.name}</h1>
          {person.biography && (
            <p className="detail-overview person-header__bio">{person.biography}</p>
          )}
        </div>
      </div>

      <section>
        <h3>Comme acteur/actrice</h3>
        {asActor.length === 0 ? (
          <EmptyState label="Aucune apparition connue." />
        ) : (
          <div className="media-grid">
            {asActor.map((item) => (
              <MediaCard key={`${item.media_type}:${item.id}`} item={{ ...item, mediaType: item.media_type }} />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 40 }}>
        <h3>Comme réalisateur/scénariste</h3>
        {asCrew.length === 0 ? (
          <EmptyState label="Aucun crédit de réalisation ou d'écriture connu." />
        ) : (
          <div className="media-grid">
            {asCrew.map((item) => (
              <MediaCard key={`${item.media_type}:${item.id}`} item={{ ...item, mediaType: item.media_type }} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
