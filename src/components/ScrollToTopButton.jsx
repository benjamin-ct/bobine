import { useEffect, useState } from "react";

const SHOW_AFTER_PX = 400;

// Petit bouton flottant qui apparaît dès qu'on a pas mal scrollé, sur
// n'importe quelle page, pour remonter en haut d'un clic.
export default function ScrollToTopButton() {
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
      className="scroll-top-btn"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Remonter en haut de la page"
      title="Remonter en haut"
    >
      ↑
    </button>
  );
}
