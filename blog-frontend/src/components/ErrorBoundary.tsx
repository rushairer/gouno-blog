import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import i18n from "i18next";
import { Button } from "./ui";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-wrapper">
          <div className="state-card error-boundary-card">
            <div className="error-boundary-icon-wrap">
              <AlertTriangle className="error-boundary-icon" size={40} />
            </div>
            <h2 className="error-boundary-title">
              {i18n.t("errorBoundary.title", {
                defaultValue: "页面遇到了错误",
              })}
            </h2>
            <p className="error-boundary-desc">
              {i18n.t("errorBoundary.description", {
                defaultValue: "抱歉，当前页面加载异常，请尝试刷新或返回首页。",
              })}
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="error-boundary-stack">
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            )}
            <div className="error-boundary-actions">
              <Button
                variant="primary"
                icon={<RefreshCw size={16} />}
                onClick={this.handleReload}
              >
                {i18n.t("errorBoundary.reloadPage", {
                  defaultValue: "刷新页面",
                })}
              </Button>
              <Button
                variant="secondary"
                icon={<Home size={16} />}
                onClick={this.handleGoHome}
              >
                {i18n.t("errorBoundary.goHome", { defaultValue: "返回首页" })}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
