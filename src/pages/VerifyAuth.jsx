import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loading } from "../components/StateMessage";

export default function VerifyAuth() {
  const [searchParams] = useSearchParams();
  const { verify } = useAuth();
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [error, setError] = useState(null);
  const attempted = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setError("Lien de connexion incomplet.");
      return;
    }
    // StrictMode monte/démonte les effets deux fois en dev : le jeton étant
    // à usage unique, un second appel échouerait à tort.
    if (attempted.current) return;
    attempted.current = true;

    verify(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setError(err.message);
      });
  }, [searchParams, verify]);

  return (
    <div className="page page--narrow">
      <h1>Connexion</h1>
      {status === "verifying" && <Loading />}
      {status === "success" && (
        <div className="auth-card">
          <p>✅ Tu es connecté·e !</p>
          <Link className="btn btn--primary" to="/ma-liste">Aller à Ma liste</Link>
        </div>
      )}
      {status === "error" && (
        <div className="auth-card">
          <p className="auth-card__error">{error}</p>
          <Link className="btn" to="/connexion">Redemander un lien</Link>
        </div>
      )}
    </div>
  );
}
