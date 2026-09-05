import type React from "react";
import { Badge } from "./Badge";
import { cn } from "../../lib/utils";

export function StatusIndicator({
  status,
  label,
  className = "",
}: {
  status: string;
  label: React.ReactNode;
  className?: string;
}) {
  const tone =
    status === "success" ||
    status === "published" ||
    status === "completed" ||
    status === "active"
      ? "success"
      : status === "danger" ||
          status === "failed" ||
          status === "rejected" ||
          status === "error"
        ? "danger"
        : status === "warning" ||
            status === "pending" ||
            status === "draft" ||
            status === "running" ||
            status === "waiting_for_user"
          ? "warning"
          : "neutral";

  return (
    <Badge
      tone={tone}
      pill
      className={cn(
        "status-pill",
        `status-pill--${status}`,
        "px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function RiskBadge({
  level,
  label,
  className = "",
}: {
  level: string;
  label: React.ReactNode;
  className?: string;
}) {
  const tone =
    level === "high" || level === "critical"
      ? "danger"
      : level === "medium" || level === "moderate"
        ? "warning"
        : "neutral";

  return (
    <Badge
      tone={tone}
      className={cn("px-2 py-0.5 text-xs uppercase font-mono", className)}
    >
      {label}
    </Badge>
  );
}
