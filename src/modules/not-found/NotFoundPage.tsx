import { Link } from "react-router-dom";
import { PageHeader } from "../../shared/components/index.ts";
import styles from "./NotFoundPage.module.css";

/** Page affichée pour toute URL qui ne correspond à aucune route connue
 * (lien mort, faute de frappe, ancien favori) — évite une zone de contenu
 * vide sous le header/footer. */
export default function NotFoundPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Erreur 404"
        title="Page introuvable"
        lead="Cette page n'existe pas ou plus. Vérifiez l'adresse saisie, ou revenez à l'accueil."
      />
      <Link to="/" className={styles.homeLink}>
        Retour à l'accueil
      </Link>
    </div>
  );
}
