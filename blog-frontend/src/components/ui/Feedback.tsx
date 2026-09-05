import React from "react";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { cn } from "../../lib/utils";

export type FeedbackType = "error" | "success" | "warning" | "info";

export function Feedback({
  type,
  children,
  className = "",
}: {
  type: FeedbackType;
  children: React.ReactNode;
  className?: string;
}) {
  const isError = type === "error";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-4 text-sm font-medium transition-colors",
        type === "error" && "border-red-500/30 bg-red-950/30 text-red-200",
        type === "success" &&
          "border-emerald-500/30 bg-emerald-950/30 text-emerald-200",
        type === "warning" &&
          "border-amber-500/30 bg-amber-950/30 text-amber-200",
        type === "info" && "border-sky-500/30 bg-sky-950/30 text-sky-200",
        className,
      )}
      role={isError ? "alert" : "status"}
    >
      <span className="shrink-0">
        {type === "error" || type === "warning" ? (
          <AlertTriangle className="h-5 w-5" />
        ) : type === "info" ? (
          <Info className="h-5 w-5" />
        ) : (
          <CheckCircle className="h-5 w-5" />
        )}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export type BannerTone = "brand" | "warning" | "danger" | "info" | "success";

export function Banner({
  tone = "info",
  icon,
  children,
  className = "",
}: {
  tone?: BannerTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "banner flex items-center gap-3 rounded-lg border p-4 text-sm font-medium transition-colors",
        `banner--${tone}`,
        tone === "brand" && "border-primary/30 bg-primary/10 text-primary",
        tone === "info" && "border-sky-500/30 bg-sky-950/30 text-sky-200",
        tone === "warning" &&
          "border-amber-500/30 bg-amber-950/30 text-amber-200",
        tone === "danger" && "border-red-500/30 bg-red-950/30 text-red-200",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-950/30 text-emerald-200",
        className,
      )}
      role="status"
    >
      {icon ? (
        <span className="banner__icon shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="banner__content flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  label,
  description,
  action,
  icon,
  className = "",
}: {
  title?: React.ReactNode;
  label?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const displayTitle = label || title || "暂无数据";
  return (
    <div
      className={cn(
        "empty-state state flex flex-col items-center justify-center p-8 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-4 text-muted-foreground">{icon}</div> : null}
      <h3 className="text-base font-semibold text-foreground">
        {displayTitle}
      </h3>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="state__actions mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  label,
  description,
  action,
  className = "",
}: {
  title?: React.ReactNode;
  label?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const displayTitle = label || title || "加载失败";
  return (
    <div
      className={cn(
        "state state--error flex flex-col items-center justify-center p-8 text-center",
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
      <h3 className="text-base font-semibold text-foreground">
        {displayTitle}
      </h3>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="state__actions mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  label = "正在加载…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground",
        className,
      )}
      role="status"
    >
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden="true"
      />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function NoticeCard({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: "info" | "warning" | "success" | "danger";
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm leading-relaxed transition-colors",
        tone === "info" && "border-sky-500/30 bg-sky-950/20 text-sky-100",
        tone === "warning" &&
          "border-amber-500/30 bg-amber-950/20 text-amber-100",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-950/20 text-emerald-100",
        tone === "danger" && "border-red-500/30 bg-red-950/20 text-red-100",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {title ? (
            <strong className="block font-semibold text-foreground">
              {title}
            </strong>
          ) : null}
          {children}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
