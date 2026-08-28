import { useEffect, useState } from "react";
import type { Video } from "../../../core/types/tmdb.ts";
import styles from "./TrailerButton.module.css";

export default function TrailerButton({ videos }: { videos: Video[] | undefined }) {
  const [open, setOpen] = useState(false);

  const trailer =
    videos?.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    videos?.find((v) => v.site === "YouTube" && v.type === "Teaser");

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!trailer) {
    return null;
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        Bande-annonce
      </button>
      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              title="Fermer"
            >
              ✕
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
              title="Bande-annonce"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </>
  );
}
