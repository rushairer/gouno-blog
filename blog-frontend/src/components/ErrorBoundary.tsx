import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Home, RefreshCw } from "lucide-react";
import i18n from "i18next";
import { Button, Card, Result } from "@gouno/ui/core";

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
        <div className="grid min-h-dvh place-items-center bg-background p-4">
          <Card as="section" className="w-full max-w-xl">
            <Result
              role="alert"
              status="error"
              title={i18n.t("errorBoundary.title", {
                defaultValue: "页面遇到了错误",
              })}
              description={i18n.t("errorBoundary.description", {
                defaultValue: "抱歉，当前页面加载异常，请尝试刷新或返回首页。",
              })}
              extra={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="solid"
                    color="primary"
                    icon={<RefreshCw size={16} />}
                    onClick={this.handleReload}
                  >
                    {i18n.t("errorBoundary.reloadPage", {
                      defaultValue: "刷新页面",
                    })}
                  </Button>
                  <Button
                    variant="outline"
                    icon={<Home size={16} />}
                    onClick={this.handleGoHome}
                  >
                    {i18n.t("errorBoundary.goHome", {
                      defaultValue: "返回首页",
                    })}
                  </Button>
                </div>
              }
            />
            {import.meta.env.DEV && this.state.error && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted p-4 font-mono text-xs text-muted-foreground">
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
