import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Video } from "../../../core/types/tmdb.ts";
import Icon from "../Icon/Icon.tsx";
import styles from "./TrailerButton.module.css";

interface TrailerButtonProps {
  videos: Video[] | undefined;
  /** Sur mobile, n'affiche que l'icône ▷ (rangée d'actions de la fiche). */
  compact?: boolean;
}

export default function TrailerButton({ videos, compact = false }: TrailerButtonProps) {
  const { t } = useTranslation();
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
      <button
        type="button"
        className={`${styles.trigger} ${compact ? styles.compact : ""}`}
        onClick={() => setOpen(true)}
        aria-label={compact ? t("trailer.button") : undefined}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span className={styles.label}>{t("trailer.button")}</span>
      </button>
      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
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
        </div>
      )}
    </>
  );
}
