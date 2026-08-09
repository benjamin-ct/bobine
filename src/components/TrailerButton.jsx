import { useEffect, useState } from "react";

export default function TrailerButton({ videos }) {
  const [open, setOpen] = useState(false);

  const trailer =
    videos?.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    videos?.find((v) => v.site === "YouTube" && v.type === "Teaser");

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!trailer) return null;

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>▶ Bande-annonce</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-video" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setOpen(false)} title="Fermer">✕</button>
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
