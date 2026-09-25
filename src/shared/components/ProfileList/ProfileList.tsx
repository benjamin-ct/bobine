import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import FollowButton from "../FollowButton/FollowButton.tsx";
import type { FollowCounts, ProfileSummary } from "../../../core/types/social.ts";
import styles from "./ProfileList.module.css";

interface Props {
  profiles: ProfileSummary[];
  /** Après un follow/unfollow depuis la liste : `profiles[index]` a changé. */
  onFollowChange?: (index: number, following: boolean, counts: FollowCounts) => void;
  /** Clic sur un profil (ex. fermer la modale qui contient la liste). */
  onNavigate?: () => void;
}

// Liste de profils (abonnés, abonnements, résultats de recherche) : avatar
// (initiale), nom et bouton Suivre/Suivi. Un profil privé n'a ni nom ni
// lien, et ne peut pas être suivi.
export default function ProfileList({ profiles, onFollowChange, onNavigate }: Props) {
  const { t } = useTranslation();
  return (
    <ul className={styles.list}>
      {profiles.map((profile, index) => {
        const name = profile.slug
          ? profile.displayName || t("publicProfile.anonymousName")
          : t("follow.privateProfile");
        return (
          <li key={profile.slug ?? `private-${index}`} className={styles.row}>
            <span className={styles.avatar} aria-hidden="true">
              {profile.slug ? name.trim().charAt(0).toUpperCase() : "?"}
            </span>
            {profile.slug ? (
              <Link to={`/u/${profile.slug}`} className={styles.name} onClick={onNavigate}>
                {name}
                {profile.isSelf && <span className={styles.self}> {t("follow.you")}</span>}
              </Link>
            ) : (
              <span className={`${styles.name} ${styles.private}`}>
                {name}
                {profile.isSelf && <span className={styles.self}> {t("follow.you")}</span>}
              </span>
            )}
            {profile.slug && !profile.isSelf && (
              <FollowButton
                slug={profile.slug}
                following={profile.viewerFollows}
                compact
                onChange={(following, counts) => onFollowChange?.(index, following, counts)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
