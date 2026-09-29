import { useTranslation } from "react-i18next";
import styles from "./StateMessage.module.css";
import Icon from "../Icon/Icon.tsx";

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.message} ${styles.loading}`} role="status">
      {label ?? t("common.loading")}
    </div>
  );
}

// `onRetry` : bouton « Réessayer » (audit M11), pour ne jamais laisser
// l'utilisateur devant une erreur sans issue.
export function ErrorMessage({
  error,
  onRetry,
}: {
  error?: { message?: string } | null;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.message} ${styles.error}`} role="alert">
      <p>
        <Icon name="frown" /> {error?.message || t("common.errorGeneric")}
      </p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <div className={styles.message}>{label}</div>;
}
