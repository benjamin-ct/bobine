export function Loading({ label = "Chargement…" }) {
  return <div className="state-message state-message--loading">{label}</div>;
}

export function ErrorMessage({ error }) {
  return (
    <div className="state-message state-message--error">
      <p>😕 {error?.message || "Une erreur est survenue."}</p>
    </div>
  );
}

export function EmptyState({ label }) {
  return <div className="state-message">{label}</div>;
}
