import type React from "react";
import { Button } from "./Button";
import { EmptyState, ErrorState, LoadingState } from "./Feedback";

export interface AsyncStateProps {
  loading: boolean;
  loadingLabel?: string;
  skeleton?: React.ReactNode;
  error?: string | null;
  empty?: boolean;
  emptyState?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  children: React.ReactNode;
}

export function AsyncState({
  loading,
  loadingLabel = "加载中…",
  skeleton,
  error,
  empty = false,
  emptyState,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRetry,
  retryLabel = "重试",
  children,
}: AsyncStateProps) {
  if (loading) {
    return skeleton ? <>{skeleton}</> : <LoadingState label={loadingLabel} />;
  }
  if (error) {
    return (
      <ErrorState
        title={error}
        action={
          onRetry ? (
            <Button variant="secondary" size="compact" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (empty) {
    return emptyState ? (
      <>{emptyState}</>
    ) : (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }
  return <>{children}</>;
}
