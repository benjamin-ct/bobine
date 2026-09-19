import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ScrollToTopButton.module.css";

const SHOW_AFTER_PX = 400;

// Petit bouton flottant qui apparaît dès qu'on a pas mal scrollé, sur
// n'importe quelle page, pour remonter en haut d'un clic.
export default function ScrollToTopButton() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={t("scrollToTop.ariaLabel")}
      title={t("scrollToTop.title")}
    >
      ↑
    </button>
  );
}
