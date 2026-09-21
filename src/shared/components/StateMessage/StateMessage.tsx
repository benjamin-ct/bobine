import { useTranslation } from "react-i18next";
import styles from "./StateMessage.module.css";

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.message} ${styles.loading}`} role="status">
      {label ?? t("common.loading")}
    </div>
  );
}

export function ErrorMessage({ error }: { error?: { message?: string } | null }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.message} ${styles.error}`} role="alert">
      <p>😕 {error?.message || t("common.errorGeneric")}</p>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <div className={styles.message}>{label}</div>;
}
