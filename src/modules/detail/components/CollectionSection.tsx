import { useEffect, useState } from "react";
import { getCollection } from "../../../core/api/tmdb.ts";
import { MediaCard } from "../../../shared/components/index.ts";
import type { CollectionDetails } from "../../../core/types/tmdb.ts";
import gridStyles from "../../../shared/styles/mediaGrid.module.css";
import styles from "./CollectionSection.module.css";

interface CollectionSectionProps {
  collectionId: number;
  currentMovieId: number;
}

// NOUVEAU (repris de la maquette HTML, absent du Projet A avant migration) :
// section "La saga" — les autres films de la même franchise
// (belongs_to_collection sur la fiche film), via un appel TMDB dédié
// /collection/{id} (voir getCollection, core/api/tmdb.ts). Rien à afficher
// pour la grande majorité des films (aucune collection) : ce composant
// n'est monté que si `details.belongs_to_collection` existe.
export default function CollectionSection({
  collectionId,
  currentMovieId,
}: CollectionSectionProps) {
  const [collection, setCollection] = useState<CollectionDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getCollection(collectionId)
      .then((data) => {
        if (!cancelled) {
          setCollection(data);
          setStatus("success");
        }
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (status !== "success" || !collection) {
    return null;
  }

  const otherParts = collection.parts.filter((p) => p.id !== currentMovieId);
  if (otherParts.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h3>
        La saga <span className={styles.name}>{collection.name}</span>{" "}
        <span className={styles.count}>· {collection.parts.length} films</span>
      </h3>
      <div className={gridStyles.grid}>
        {otherParts.map((part) => (
          <MediaCard key={part.id} item={{ ...part, mediaType: "movie" }} />
        ))}
      </div>
    </section>
  );
}
