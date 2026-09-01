import { PageHeader } from "../../shared/components/index.ts";
import LegalSection from "./LegalSection.tsx";
import { LEGAL_CONTACT_LABEL, LEGAL_CONTACT_URL } from "./contact.ts";
import styles from "./LegalPage.module.css";

const LAST_UPDATED = "1 septembre 2026";

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Informations légales" title="Conditions d'utilisation" />
      <p className={styles.updated}>Dernière mise à jour : {LAST_UPDATED}</p>

      <LegalSection title="Éditeur">
        <p>
          Bobine est un projet personnel, sans structure commerciale, développé et opéré depuis la
          France. Il n'y a pas encore d'adresse de contact publique dédiée : en attendant, vous
          pouvez nous joindre {LEGAL_CONTACT_LABEL} (
          <a href={LEGAL_CONTACT_URL} target="_blank" rel="noreferrer">
            {LEGAL_CONTACT_URL}
          </a>
          ).
        </p>
      </LegalSection>

      <LegalSection title="Le service">
        <p>
          Bobine permet de découvrir des films et séries, de suivre une bibliothèque personnelle
          («&nbsp;vu&nbsp;», «&nbsp;envie de voir&nbsp;», listes personnalisées) et de recevoir des
          notifications sur les nouveautés. Les catalogues, fiches, affiches et disponibilités par
          plateforme de streaming proviennent de services tiers (voir notre{" "}
          <a href="/confidentialite">politique de confidentialité</a>) et sont fournis à titre
          indicatif : nous ne garantissons pas leur exactitude ni leur exhaustivité.
        </p>
      </LegalSection>

      <LegalSection title="Compte et connexion">
        <p>
          La création d'un compte se fait par email, via un lien de connexion à usage unique (aucun
          mot de passe n'est stocké). Vous êtes responsable de la sécurité de l'accès à votre boîte
          email, seul moyen d'accéder à votre compte.
        </p>
      </LegalSection>

      <LegalSection title="Usage autorisé">
        <p>
          Le service est proposé gratuitement, pour un usage personnel et non commercial. Toute
          utilisation automatisée ou abusive (extraction massive de données, contournement des
          mesures de sécurité ou des limites de requêtes) est interdite.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilité et évolution du service">
        <p>
          Bobine est un projet personnel en développement actif : fonctionnalités, apparence et
          disponibilité peuvent évoluer, y compris être interrompues, sans préavis. Aucune garantie
          de disponibilité continue n'est fournie (pas d'engagement de niveau de service).
        </p>
        <p>
          Le service est gratuit à ce jour et le restera pour ses fonctionnalités actuelles ; un
          moyen de financement libre (dons ponctuels) pourra être proposé à l'avenir, sans que cela
          ne rende l'accès au service payant.
        </p>
      </LegalSection>

      <LegalSection title="Responsabilité">
        <p>
          Le service est fourni «&nbsp;en l'état&nbsp;», sans garantie d'aucune sorte. Dans les
          limites permises par la loi française, l'éditeur ne pourra être tenu responsable des
          dommages résultant de l'utilisation ou de l'impossibilité d'utiliser le service.
        </p>
      </LegalSection>

      <LegalSection title="Droit applicable">
        <p>Les présentes conditions sont soumises au droit français.</p>
      </LegalSection>

      <LegalSection title="Modification des présentes conditions">
        <p>
          Ces conditions peuvent être modifiées à mesure que le service évolue. La date de dernière
          mise à jour est indiquée en haut de cette page ; nous vous invitons à la consulter
          régulièrement.
        </p>
      </LegalSection>
    </div>
  );
}
