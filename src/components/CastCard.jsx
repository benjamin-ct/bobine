import { Link } from "react-router-dom";
import { posterUrl } from "../api/tmdb";

export default function CastCard({ member }) {
  return (
    <Link to={`/personne/${member.id}`} className="person-card">
      <div className="person-card__photo">
        {member.profile_path ? (
          <img src={posterUrl(member.profile_path, "w185")} alt={member.name} loading="lazy" />
        ) : (
          <div className="person-card__no-photo">{member.name}</div>
        )}
      </div>
      <p className="person-card__name">{member.name}</p>
      {member.character && <p className="person-card__role">{member.character}</p>}
    </Link>
  );
}
