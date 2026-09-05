import type { HTMLAttributes, ReactNode } from "react";
import { Badge as PrimitiveBadge } from "./components/ui/badge";
import { cn } from "./lib/utils";
export type BadgeTone =
  "neutral" | "brand" | "success" | "warning" | "danger" | "info";
const colors: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-accent text-accent-foreground border-primary/30",
  success: "bg-success-subtle text-success border-success/30",
  warning: "bg-warning-subtle text-warning border-warning/30",
  danger: "bg-danger-subtle text-destructive border-destructive/30",
  info: "bg-info-subtle text-info border-info/30",
};
export function Badge({
  tone = "neutral",
  pill: _pill,
  variant: _variant,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  pill?: boolean;
  variant?: string;
}) {
  return (
    <PrimitiveBadge
      {...props}
      variant="outline"
      className={cn(
        "badge",
        `badge--${tone}`,
        "rounded-sm px-1.5 py-0.5 font-medium",
        colors[tone],
        className,
      )}
    />
  );
}
export function StatusIndicator({
  status,
  label,
  className,
}: {
  status: string;
  label: ReactNode;
  className?: string;
}) {
  const tone = /^(success|published|completed|active|approved|delivered)$/.test(
    status,
  )
    ? "success"
    : /^(danger|failed|rejected|error)$/.test(status)
      ? "danger"
      : /^(warning|pending|draft|running|waiting_for_user|awaiting_approval)$/.test(
            status,
          )
        ? "warning"
        : "neutral";
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
export function RiskBadge({
  level,
  label,
  className,
}: {
  level: string;
  label: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      className={className}
      tone={
        ["high", "critical"].includes(level)
          ? "danger"
          : ["medium", "moderate"].includes(level)
            ? "warning"
            : "neutral"
      }
    >
      {label}
    </Badge>
  );
}

export const Tag = Badge;
export function StatusBadge({
  status = "draft",
  children,
  label,
  tone,
  compact,
  className,
}: {
  status?: string;
  children?: ReactNode;
  label?: ReactNode;
  tone?: BadgeTone;
  compact?: boolean;
  className?: string;
}) {
  const text =
    children ||
    label ||
    (
      {
        published: "已发布",
        draft: "草稿",
        scheduled: "定时发布",
        hidden: "已隐藏",
      } as Record<string, string>
    )[status] ||
    status;
  return tone ? (
    <Badge
      tone={tone}
      className={cn(
        `status-badge status-badge--${status} status-pill`,
        compact && "compact",
        className,
      )}
    >
      {text}
    </Badge>
  ) : (
    <StatusIndicator
      status={status}
      label={text}
      className={cn(
        `status-badge status-badge--${status} status-pill`,
        compact && "compact",
        className,
      )}
    />
  );
}
