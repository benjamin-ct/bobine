import styles from "./StateMessage.module.css";

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className={`${styles.message} ${styles.loading}`} role="status">
      {label}
    </div>
  );
}

export function ErrorMessage({ error }: { error?: { message?: string } | null }) {
  return (
    <div className={`${styles.message} ${styles.error}`} role="alert">
      <p>😕 {error?.message || "Une erreur est survenue."}</p>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <div className={styles.message}>{label}</div>;
}
