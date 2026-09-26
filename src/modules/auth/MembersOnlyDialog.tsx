import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMembersOnly } from "../../core/context/MembersOnlyContext.tsx";
import LoginForm from "./LoginForm.tsx";
import { Icon } from "../../shared/components/index.ts";
import styles from "./MembersOnlyDialog.module.css";

// Modale ouverte quand un visiteur non connecté tente une action qui écrit
// dans sa bibliothèque (voir MembersOnlyContext) : explique pourquoi et
// propose de se connecter sur place, sans quitter la page. `<dialog>` natif
// pour avoir gratuitement la top layer, le piège à focus et la touche Échap.
export default function MembersOnlyDialog() {
  const { t } = useTranslation();
  const { promptOpen, closePrompt } = useMembersOnly();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (promptOpen && !dialog.open) {
      dialog.showModal();
    } else if (!promptOpen && dialog.open) {
      dialog.close();
    }
  }, [promptOpen]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="members-only-title"
      // Échap ou dialog.close() : on resynchronise l'état du contexte.
      onClose={closePrompt}
      // Clic sur le fond (hors du contenu) : ferme la modale.
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closePrompt();
        }
      }}
    >
      {/* Démonté à la fermeture pour repartir d'un formulaire vierge. */}
      {promptOpen && (
        <div className={styles.content}>
          <button
            type="button"
            className={styles.close}
            onClick={closePrompt}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <Icon name="close" />
          </button>
          <h2 id="members-only-title" className={styles.title}>
            {t("membersOnly.title")}
          </h2>
          <p className={styles.text}>{t("membersOnly.text")}</p>
          <LoginForm />
        </div>
      )}
    </dialog>
  );
}
