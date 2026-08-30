import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Le badge flottant que reCAPTCHA v3 injecte lui-même dans le DOM (voir
// core/lib/recaptcha.ts) vit en dehors de React et n'est jamais nettoyé :
// une fois apparu, il reste affiché sur toutes les pages tant qu'il n'y a
// pas de vrai rechargement. On le masque donc nous-mêmes en dehors des
// pages qui déclenchent réellement reCAPTCHA.
const RECAPTCHA_PATHS = ["/connexion", "/auth/verify"];

function setBadgeVisibility(visible: boolean) {
  const badge = document.querySelector<HTMLElement>(".grecaptcha-badge");
  if (badge) {
    badge.style.display = visible ? "" : "none";
  }
}

export default function RecaptchaBadge() {
  const { pathname } = useLocation();
  const visible = RECAPTCHA_PATHS.includes(pathname);

  useEffect(() => {
    setBadgeVisibility(visible);

    if (visible) {
      return;
    }

    // Le script reCAPTCHA peut encore être en cours de chargement au
    // moment où on quitte la page : on observe son insertion pour le
    // masquer dès qu'il apparaît tant qu'on n'est pas sur une page qui en
    // a besoin.
    const observer = new MutationObserver(() => setBadgeVisibility(false));
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [visible]);

  return null;
}
