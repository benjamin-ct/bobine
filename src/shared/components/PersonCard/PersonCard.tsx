import { memo } from "react";
import { Link } from "react-router-dom";
import { posterUrl } from "../../../core/api/tmdb.ts";
import { posterAccentFromSeed } from "../../lib/posterAccent.ts";
import posterStyles from "../../styles/posterAccents.module.css";
import styles from "./PersonCard.module.css";

const DEPARTMENT_LABELS: Record<string, string> = {
  Acting: "Acteur/Actrice",
  Directing: "Réalisateur/Réalisatrice",
  Writing: "Scénariste",
  Production: "Production",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface PersonCardProps {
  id: number;
  name: string;
  profilePath?: string | null;
  /** Rôle affiché — sinon dérivé de `knownForDepartment` (fiche personne
   * générique) ou laissé vide (casting, voir `role` explicite du crédit). */
  role?: string | null;
  knownForDepartment?: string | null;
}

// `memo` : les mêmes grilles denses (casting, filmographie...) que
// MediaCard — voir son commentaire pour le raisonnement.
function PersonCard({ id, name, profilePath, role, knownForDepartment }: PersonCardProps) {
  const label =
    role || (knownForDepartment && (DEPARTMENT_LABELS[knownForDepartment] || knownForDepartment));
  const accentKey = posterAccentFromSeed(name);

  return (
    <Link to={`/personne/${id}`} className={styles.card}>
      <div className={styles.photo}>
        {profilePath ? (
          <img src={posterUrl(profilePath, "w185") ?? undefined} alt={name} loading="lazy" />
        ) : (
          <div className={`${styles.avatar} ${posterStyles[accentKey]}`}>{initials(name)}</div>
        )}
      </div>
      <p className={styles.name}>{name}</p>
      {label && <p className={styles.role}>{label}</p>}
    </Link>
  );
}

export default memo(PersonCard);
