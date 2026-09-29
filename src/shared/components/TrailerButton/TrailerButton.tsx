import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Video } from "../../../core/types/tmdb.ts";
import Icon from "../Icon/Icon.tsx";
import styles from "./TrailerButton.module.css";

interface TrailerButtonProps {
  videos: Video[] | undefined;
  /** Placement dans la rangée d'actions de l'appelant (ex. fiche détail). */
  className?: string;
}

export default function TrailerButton({ videos, className = "" }: TrailerButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const trailer =
    videos?.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    videos?.find((v) => v.site === "YouTube" && v.type === "Teaser");

  // `<dialog>` natif en modale (audit H14) : top layer (plus besoin de
  // portail pour échapper au bloc du haut de la fiche), piège à focus, Échap,
  // fond inerte pour les lecteurs d'écran et focus rendu au bouton à la
  // fermeture. Le défilement de la page est bloqué pendant la lecture.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) {
      return;
    }
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open]);

  if (!trailer) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${className}`}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span className={styles.label}>{t("trailer.button")}</span>
      </button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-label={t("trailer.iframeTitle")}
        // Échap : le navigateur ferme la modale, on resynchronise l'état.
        onClose={() => setOpen(false)}
        // Clic sur le fond (hors de la vidéo) : ferme la modale.
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setOpen(false);
          }
        }}
      >
        {/* Démonté à la fermeture : la vidéo s'arrête. */}
        {open && (
          <div className={styles.modal}>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <Icon name="close" />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
              title={t("trailer.iframeTitle")}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </dialog>
    </>
  );
}
