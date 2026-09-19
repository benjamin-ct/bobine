import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  if (
    !providers ||
    (!providers.flatrate?.length && !providers.rent?.length && !providers.buy?.length)
  ) {
    return <p className={styles.empty}>{t("providerBadges.unavailable")}</p>;
  }

  const { flatrate, rent, buy, link } = providers;

  return (
    <div className={styles.badges}>
      <Row label={t("providerBadges.subscription")} items={flatrate} />
      <Row label={t("providerBadges.rent")} items={rent} />
      <Row label={t("providerBadges.buy")} items={buy} />
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className={styles.link}>
          {t("providerBadges.justwatchLink")}
        </a>
      )}
    </div>
  );
}
