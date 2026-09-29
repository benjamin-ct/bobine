import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { logError } from "../../../core/logger.ts";
import PageHeader from "../PageHeader/PageHeader.tsx";
import styles from "./ErrorBoundary.module.css";

interface Props {
  children: ReactNode;
  // Changer cette clé (le pathname, dans App) efface l'erreur : naviguer
  // vers une autre page quitte l'écran d'erreur sans recharger.
  resetKey?: string;
}

interface State {
  error: Error | null;
  resetKey: string | undefined;
}

/** Filet de sécurité autour des pages : une exception de rendu (donnée TMDB
 * inattendue…) affiche un écran « Oups » avec Réessayer au lieu de démonter
 * toute l'appli (écran blanc), et part dans Sentry via logError. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(`Erreur de rendu React${info.componentStack ?? ""}`, error);
  }

  render() {
    if (this.state.error) {
      return <RenderErrorFallback onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function RenderErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={styles.page} role="alert">
      <PageHeader
        eyebrow={t("errorBoundary.eyebrow")}
        title={t("errorBoundary.title")}
        lead={t("errorBoundary.lead")}
      />
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onRetry}>
          {t("errorBoundary.retry")}
        </button>
        {/* Lien natif (rechargement complet) : l'état de l'appli est peut-être
            incohérent, et ce fallback sert aussi hors des routes. */}
        <a href="/" className={styles.secondary}>
          {t("errorBoundary.backToHome")}
        </a>
      </div>
    </div>
  );
}
