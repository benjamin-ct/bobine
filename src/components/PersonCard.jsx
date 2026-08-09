import { Link } from "react-router-dom";
import { posterUrl } from "../api/tmdb";

const DEPARTMENT_LABELS = {
  Acting: "Acteur/Actrice",
  Directing: "Réalisateur/Réalisatrice",
  Writing: "Scénariste",
  Production: "Production",
};

export default function PersonCard({ person }) {
  return (
    <Link to={`/personne/${person.id}`} className="person-card">
      <div className="person-card__photo">
        {person.profile_path ? (
          <img src={posterUrl(person.profile_path, "w185")} alt={person.name} loading="lazy" />
        ) : (
          <div className="person-card__no-photo">{person.name}</div>
        )}
      </div>
      <p className="person-card__name">{person.name}</p>
      <p className="person-card__role">
        {DEPARTMENT_LABELS[person.known_for_department] || person.known_for_department || "Personnalité"}
      </p>
    </Link>
  );
}
