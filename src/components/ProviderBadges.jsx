import { logoUrl } from "../api/tmdb";

function Row({ label, items }) {
  if (!items?.length) return null;
  return (
    <div className="provider-row">
      <span className="provider-row__label">{label}</span>
      <div className="provider-row__logos">
        {items.map((p) => (
          <img
            key={p.provider_id}
            src={logoUrl(p.logo_path)}
            alt={p.provider_name}
            title={p.provider_name}
            className="provider-logo"
          />
        ))}
      </div>
    </div>
  );
}

export default function ProviderBadges({ providers }) {
  if (!providers) {
    return <p className="providers-empty">Non disponible en streaming en France pour le moment.</p>;
  }

  const { flatrate, rent, buy, link } = providers;

  if (!flatrate?.length && !rent?.length && !buy?.length) {
    return <p className="providers-empty">Non disponible en streaming en France pour le moment.</p>;
  }

  return (
    <div className="provider-badges">
      <Row label="Inclus avec abonnement" items={flatrate} />
      <Row label="Location" items={rent} />
      <Row label="Achat" items={buy} />
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="provider-link">
          Voir toutes les options sur JustWatch →
        </a>
      )}
    </div>
  );
}
