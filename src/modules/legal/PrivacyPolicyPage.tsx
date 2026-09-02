import { PageHeader } from "../../shared/components/index.ts";
import LegalSection from "./LegalSection.tsx";
import { LEGAL_CONTACT_LABEL, LEGAL_CONTACT_URL } from "./contact.ts";
import styles from "./LegalPage.module.css";

const LAST_UPDATED = "2 septembre 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Informations légales" title="Politique de confidentialité" />
      <p className={styles.updated}>Dernière mise à jour : {LAST_UPDATED}</p>

      <LegalSection title="Responsable du traitement">
        <p>
          Bobine est un projet personnel, sans structure commerciale, opéré depuis la France. Le
          traitement des données décrit ci-dessous relève donc du droit français et du RGPD. Il n'y
          a pas encore d'adresse de contact publique dédiée : en attendant, vous pouvez nous joindre{" "}
          {LEGAL_CONTACT_LABEL} (
          <a href={LEGAL_CONTACT_URL} target="_blank" rel="noreferrer">
            {LEGAL_CONTACT_URL}
          </a>
          ).
        </p>
      </LegalSection>

      <LegalSection title="Données que nous collectons">
        <ul>
          <li>
            <strong>Compte</strong> : votre adresse email (seule information demandée à
            l'inscription), utilisée pour la connexion par lien/code à usage unique — aucun mot de
            passe n'est stocké.
          </li>
          <li>
            <strong>Bibliothèque personnelle</strong> : les films/séries que vous marquez
            «&nbsp;vus&nbsp;» ou «&nbsp;envie de voir&nbsp;», vos listes personnalisées et leur
            contenu.
          </li>
          <li>
            <strong>Préférences</strong> : genres exclus, plateformes de streaming favorites,
            région.
          </li>
          <li>
            <strong>Notifications push</strong> (si vous les activez) : l'identifiant technique
            d'abonnement de votre navigateur et les clés de chiffrement associées, utilisés
            uniquement pour vous envoyer les notifications de nouveautés que vous avez demandées.
          </li>
          <li>
            <strong>Données techniques</strong> : votre adresse IP est traitée brièvement pour
            limiter les abus (anti-spam sur la connexion), sans être conservée sous une forme
            identifiable liée à votre compte.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Pourquoi nous les utilisons">
        <p>
          Ces données servent uniquement à faire fonctionner le compte, la bibliothèque et les
          notifications que vous avez explicitement demandées. La base légale est l'exécution du
          service que vous nous demandez (compte, watchlist) et, pour les notifications push, votre
          consentement explicite (activation manuelle dans l'application, révocable à tout moment).
        </p>
      </LegalSection>

      <LegalSection title="Avec qui ces données sont partagées">
        <p>Bobine s'appuie sur les prestataires suivants pour fonctionner :</p>
        <ul>
          <li>
            <strong>TMDB</strong> (The Movie Database) : fournit le catalogue, les fiches et les
            affiches — aucune donnée personnelle ne lui est transmise, seules des requêtes de
            contenu.
          </li>
          <li>
            <strong>Resend</strong> : envoie les emails contenant votre lien/code de connexion —
            reçoit votre adresse email à cette seule fin.
          </li>
          <li>
            <strong>Google reCAPTCHA</strong> : protège certains formulaires contre les robots,
            selon la politique de confidentialité de Google.
          </li>
          <li>
            <strong>Cloudflare</strong> : héberge l'application et la base de données (Workers, D1).
          </li>
          <li>
            <strong>Sentry</strong> : reçoit les erreurs techniques survenant dans l'application
            (navigateur et serveur), dans le seul but de les diagnostiquer et de les corriger. Une
            erreur peut occasionnellement contenir des informations techniques (URL visitée, message
            d'erreur) mais aucune donnée de compte n'y est envoyée intentionnellement.
          </li>
          <li>
            <strong>Cloudflare Web Analytics</strong> : mesure d'audience anonyme (pages vues,
            visiteurs) — sans cookies, sans identifiant persistant, sans donnée personnelle.
          </li>
        </ul>
        <p>Aucune de ces données n'est vendue ni utilisée à des fins publicitaires.</p>
      </LegalSection>

      <LegalSection title="Cookies et outils de mesure">
        <p>
          Bobine utilise Cloudflare Web Analytics pour mesurer la fréquentation du site de façon
          anonyme, sans cookies ni identifiant permettant de suivre une personne d'une visite à
          l'autre. Sentry est utilisé pour le suivi et le diagnostic des erreurs techniques (voir
          ci-dessus). Aucun de ces deux outils ne sert à des fins publicitaires ou de profilage. Si
          un nouvel outil de mesure d'audience ou de tracking publicitaire venait à être ajouté,
          cette politique serait mise à jour au préalable pour le refléter.
        </p>
      </LegalSection>

      <LegalSection title="Durée de conservation">
        <p>
          Vos données sont conservées tant que votre compte existe. La suppression de compte à la
          demande n'est pas encore automatisée dans l'application : en attendant, vous pouvez
          demander la suppression de votre compte et de vos données {LEGAL_CONTACT_LABEL}.
        </p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de
          limitation, de portabilité et d'opposition sur vos données. Vous pouvez exercer ces droits{" "}
          {LEGAL_CONTACT_LABEL}, et introduire une réclamation auprès de la CNIL si vous estimez que
          vos droits ne sont pas respectés.
        </p>
      </LegalSection>

      <LegalSection title="Modification de cette politique">
        <p>
          Cette politique peut évoluer avec le service, notamment si de nouveaux outils (mesure
          d'audience, financement participatif...) sont ajoutés. La date de dernière mise à jour est
          indiquée en haut de cette page.
        </p>
      </LegalSection>
    </div>
  );
}
