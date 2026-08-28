import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthCallback } from "@gosso/client/react";
import { LoadingState, Panel } from "../components/ui";
import { useI18n } from "../i18n";

export default function Callback() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const handleSuccess = useCallback(
    (redirectTo: string) => navigate(redirectTo),
    [navigate],
  );

  return (
    <AuthCallback
      onSuccess={handleSuccess}
      renderError={(error) => (
      <div className="auth-page">
        <Panel className="auth-card section-stack">
          <h2>{t("authError")}</h2>
          <p className="muted">
            {error === "Missing authorization code or state parameter"
              ? t("invalidCallback")
              : error || t("authFailed")}
          </p>
          <a href="/" className="btn btn-primary">
            {t("goHome")}
          </a>
        </Panel>
      </div>
      )}
      renderLoading={() => (
    <div className="auth-page">
      <Panel className="auth-card">
        <LoadingState label={t("completingSignin")} />
      </Panel>
      </div>
      )}
    />
  );
}
