import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import styles from "./AccountCard.module.css";

function initials(name: string, fallback: string): string {
  const source = name.trim() || fallback;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AccountCard() {
  const { status, email, displayName, updateDisplayName, logout } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Source de vérité : D1 (colonne users.display_name), chargée avec le
  // reste de la session (voir AuthContext, /api/auth/me) — c'est ce qui
  // rend le nom identique sur tous les appareils une fois enregistré
  // (ticket #45). Resynchronise le champ chaque fois que la valeur connue
  // du serveur change (connexion, ou juste après un enregistrement réussi).
  useEffect(() => {
    setName(displayName ?? "");
  }, [displayName]);

  if (status !== "authenticated") {
    return (
      <div className={styles.card}>
        <span className={styles.k}>Compte</span>
        <p className={styles.hint}>Connecte-toi pour synchroniser ta liste entre appareils.</p>
        <Link to="/connexion" className={styles.loginBtn}>
          Connexion
        </Link>
      </div>
    );
  }

  // Save manuel uniquement (bouton "Enregistrer" ci-dessous) : pas de
  // synchro automatique/temps réel — décision produit explicite pour le
  // ticket #45. Pas de gestion de conflit multi-appareils : dernier
  // enregistrement gagnant, jugé suffisant tant qu'il n'y a pas
  // d'utilisateurs réels.
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateDisplayName(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer le nom affiché.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.card}>
      <span className={styles.k}>Compte</span>
      <div className={styles.row}>
        <div className={styles.avatar}>{initials(name, email || "?")}</div>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Nom affiché</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ton nom"
            />
          </label>
          <label className={styles.field}>
            <span>Adresse e-mail</span>
            <input type="email" value={email || ""} disabled />
          </label>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className={styles.logoutBtn} onClick={logout}>
          Se déconnecter
        </button>
        {saved && <span className={styles.savedHint}>✓ Modifications enregistrées</span>}
        {error && <span className={styles.errorHint}>{error}</span>}
      </div>
    </div>
  );
}
