import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../core/context/AuthContext.tsx";
import { Loading } from "../../shared/components/index.ts";
import styles from "./AuthPages.module.css";

export default function VerifyAuthPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { verify } = useAuth();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setError(t("auth.verify.incompleteLink"));
      return;
    }
    // StrictMode monte/démonte les effets deux fois en dev : le jeton étant
    // à usage unique, un second appel échouerait à tort.
    if (attempted.current) {
      return;
    }
    attempted.current = true;

    verify(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : t("auth.verify.unknownError"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, verify]);

  return (
    <div className={styles.page}>
      <h1>{t("auth.verify.title")}</h1>
      {status === "verifying" && <Loading />}
      {status === "success" && (
        <div className={styles.card}>
          <p>{t("auth.verify.success")}</p>
          <Link className={styles.primaryBtn} to="/profil?tab=ma-liste">
            {t("auth.verify.goToMyList")}
          </Link>
        </div>
      )}
      {status === "error" && (
        <div className={styles.card}>
          <p className={styles.error}>{error}</p>
          <Link className={styles.secondaryBtn} to="/connexion">
            {t("auth.verify.requestNewLink")}
          </Link>
        </div>
      )}
    </div>
  );
}
