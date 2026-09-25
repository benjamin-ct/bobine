import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../core/context/AuthContext.tsx";
import LoginForm from "./LoginForm.tsx";
import styles from "./AuthPages.module.css";

export default function LoginPage() {
  const { t } = useTranslation();
  const { status } = useAuth();

  // La redirection se fait ici une fois que le statut d'auth passe à
  // "authenticated" (code validé dans LoginForm, ou session déjà ouverte).
  if (status === "authenticated") {
    return <Navigate to="/profil?tab=ma-liste" replace />;
  }

  return (
    <div className={styles.page}>
      <h1>{t("loginPage.title")}</h1>
      <p className={styles.subtitle}>{t("loginPage.subtitle")}</p>
      <LoginForm />
    </div>
  );
}
