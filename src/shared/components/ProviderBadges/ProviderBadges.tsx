import { logoUrl } from "../../../core/api/tmdb.ts";
import type { RegionWatchProviders, WatchProviderEntry } from "../../../core/types/tmdb.ts";
import styles from "./ProviderBadges.module.css";

function Row({ label, items }: { label: string; items: WatchProviderEntry[] | undefined }) {
  if (!items?.length) {
    return null;
  }
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.logos}>
        {items.map((p) => (
          <img
            key={p.provider_id}
            src={logoUrl(p.logo_path) ?? undefined}
            alt={p.provider_name}
            title={p.provider_name}
            className={styles.logo}
          />
        ))}
      </div>
    </div>
  );
}

export default function ProviderBadges({ providers }: { providers: RegionWatchProviders | null }) {
  if (
    !providers ||
    (!providers.flatrate?.length && !providers.rent?.length && !providers.buy?.length)
  ) {
    return <p className={styles.empty}>Non disponible en streaming en France pour le moment.</p>;
  }

  const { flatrate, rent, buy, link } = providers;

  return (
    <div className={styles.badges}>
      <Row label="Inclus avec abonnement" items={flatrate} />
      <Row label="Location" items={rent} />
      <Row label="Achat" items={buy} />
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className={styles.link}>
          Voir toutes les options sur JustWatch →
        </a>
      )}
    </div>
  );
}
