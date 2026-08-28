import { useEffect, useState } from "react";
import { getDetails } from "../../../core/api/tmdb.ts";
import { PersonCard } from "../../../shared/components/index.ts";
import gridStyles from "../../../shared/styles/mediaGrid.module.css";
import type { MediaType } from "../../../core/types/tmdb.ts";

interface CreditRef {
  id: number;
  media_type: MediaType;
}

interface Collaborator {
  id: number;
  name: string;
  profilePath: string | null;
  count: number;
}

// NOUVEAU (repris de la maquette HTML, absent du Projet A avant migration) :
// "Souvent à l'affiche avec" — personnes revenant sur plusieurs titres de
// la filmographie. TMDB n'expose pas cette info directement : on
// échantillonne les `sampleSize` crédits les plus pertinents (déjà triés
// par date, voir PersonPage) et on compte les co-apparitions (cast + crew)
// dans leurs fiches détail — plafonné pour ne pas multiplier les appels
// réseau sur une filmographie longue.
const SAMPLE_SIZE = 10;
const MIN_OCCURRENCES = 2;
const MAX_RESULTS = 7;

export default function FrequentCollaborators({
  personId,
  credits,
}: {
  personId: number;
  credits: CreditRef[];
}) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [status, setStatus] = useState<"loading" | "done">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const sample = credits.slice(0, SAMPLE_SIZE);
    Promise.all(sample.map((c) => getDetails(c.media_type, c.id).catch(() => null)))
      .then((results) => {
        if (cancelled) {
          return;
        }
        const counts = new Map<number, Collaborator>();
        for (const details of results) {
          if (!details) {
            continue;
          }
          const people = [...(details.credits?.cast || []), ...(details.credits?.crew || [])];
          for (const p of people) {
            if (p.id === personId) {
              continue;
            }
            const existing = counts.get(p.id);
            if (existing) {
              existing.count += 1;
            } else {
              counts.set(p.id, {
                id: p.id,
                name: p.name,
                profilePath: p.profile_path ?? null,
                count: 1,
              });
            }
          }
        }
        const top = [...counts.values()]
          .filter((c) => c.count >= MIN_OCCURRENCES)
          .sort((a, b) => b.count - a.count)
          .slice(0, MAX_RESULTS);
        setCollaborators(top);
        setStatus("done");
      })
      .catch(() => !cancelled && setStatus("done"));
    return () => {
      cancelled = true;
    };
  }, [personId, credits]);

  if (status === "done" && collaborators.length === 0) {
    return null;
  }

  return (
    <section style={{ marginTop: 48 }}>
      <h3 style={{ marginBottom: 16 }}>Souvent à l'affiche avec</h3>
      {status === "loading" ? (
        <p style={{ color: "var(--muted)" }}>Recherche des collaborateur·rices…</p>
      ) : (
        <div className={gridStyles.grid} style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
          {collaborators.map((c) => (
            <PersonCard
              key={c.id}
              id={c.id}
              name={c.name}
              profilePath={c.profilePath}
              role={`${c.count} titres ensemble`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
