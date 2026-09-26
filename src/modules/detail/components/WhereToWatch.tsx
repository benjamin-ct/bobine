import { useTranslation } from "react-i18next";
import { logoUrl } from "../../../core/api/tmdb.ts";
import { useFavoriteProviders } from "../../../core/context/FavoriteProvidersContext.tsx";
import type { RegionWatchProviders, WatchProviderEntry } from "../../../core/types/tmdb.ts";
import styles from "./WhereToWatch.module.css";

interface WhereToWatchProps {
  providers: RegionWatchProviders | null;
  regionName: string | null;
}

// « Où le voir » (nouvelle DA) : deux groupes, « En abonnement » et
// « Location ou achat » (une plateforme qui loue ET vend n'apparaît qu'une
// fois), avec un badge « Chez vous » sur les plateformes de l'utilisateur.
export default function WhereToWatch({ providers, regionName }: WhereToWatchProps) {
  const { t } = useTranslation();
  const { isFavoriteProvider } = useFavoriteProviders();

  const flatrate = providers?.flatrate ?? [];
  const seen = new Set<number>();
  const rentOrBuy = [...(providers?.rent ?? []), ...(providers?.buy ?? [])].filter((p) => {
    if (seen.has(p.provider_id)) {
      return false;
    }
    seen.add(p.provider_id);
    return true;
  });

  function group(label: string, items: WatchProviderEntry[]) {
    if (items.length === 0) {
      return null;
    }
    // Les plateformes de l'utilisateur d'abord, en gardant l'ordre TMDB.
    const sorted = [
      ...items.filter((p) => isFavoriteProvider(p.provider_id)),
      ...items.filter((p) => !isFavoriteProvider(p.provider_id)),
    ];
    return (
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>{label}</h3>
        <ul className={styles.list}>
          {sorted.map((p) => (
            <li
              key={p.provider_id}
              className={`${styles.provider} ${isFavoriteProvider(p.provider_id) ? styles.providerYours : ""}`}
            >
              <img src={logoUrl(p.logo_path) ?? undefined} alt="" className={styles.logo} />
              <span className={styles.name}>{p.provider_name}</span>
              {isFavoriteProvider(p.provider_id) && (
                <span className={styles.yours}>{t("detailPage.yourPlatform")}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>
        {t("detailPage.whereToWatch")}
        {regionName && (
          <span className={styles.region}>
            {t("detailPage.whereToWatchSource", { region: regionName })}
          </span>
        )}
      </h2>
      {flatrate.length === 0 && rentOrBuy.length === 0 ? (
        <p className={styles.empty}>
          {regionName
            ? t("providerBadges.unavailable", { region: regionName })
            : t("providerBadges.unavailableGeneric")}
        </p>
      ) : (
        <>
          {group(t("detailPage.subscription"), flatrate)}
          {group(t("detailPage.rentOrBuy"), rentOrBuy)}
        </>
      )}
      <p className={styles.note}>
        {t("detailPage.noStreamingNote")}
        {providers?.link && (
          <>
            {" "}
            <a href={providers.link} target="_blank" rel="noreferrer">
              {t("providerBadges.justwatchLink")}
            </a>
          </>
        )}
      </p>
    </section>
  );
}
