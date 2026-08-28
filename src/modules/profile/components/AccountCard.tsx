import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../core/context/AuthContext.tsx";
import styles from "./AccountCard.module.css";

const DISPLAY_NAME_KEY = "bobine.displayName";

function loadDisplayName(): string {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY) || "";
  } catch {
    return "";
  }
}

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
  const { status, email, logout } = useAuth();
  const [name, setName] = useState(loadDisplayName);
  const [saved, setSaved] = useState(false);

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

  function save() {
    // Nom affiché : préférence purement locale (aucune colonne dédiée côté
    // D1 pour ça aujourd'hui — voir README, "Fonctionnalités en stub" — le
    // compte n'a qu'un email, pas de profil étendu). Pas de faux
    // comportement de synchro simulé : ce choix reste sur cet appareil.
    try {
      localStorage.setItem(DISPLAY_NAME_KEY, name.trim());
    } catch {
      // Repli silencieux : le nom reste appliqué pour cette session.
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className={styles.card}>
      <span className={styles.k}>Compte</span>
      <div className={styles.row}>
        <div className={styles.avatar}>{initials(name, email || "?")}</div>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Nom affiché (local à cet appareil)</span>
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
        <button type="button" className={styles.saveBtn} onClick={save}>
          Enregistrer
        </button>
        <button type="button" className={styles.logoutBtn} onClick={logout}>
          Se déconnecter
        </button>
        {saved && <span className={styles.savedHint}>✓ Modifications enregistrées</span>}
      </div>
    </div>
  );
}
