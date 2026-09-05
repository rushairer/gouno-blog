import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      tone: {
        primary:
          "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/80",
        brand:
          "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/80",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        neutral:
          "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
        warning: "border-amber-500/30 bg-amber-500/15 text-amber-300",
        danger: "border-red-500/30 bg-red-500/15 text-red-300",
        destructive: "border-red-500/30 bg-red-500/15 text-red-300",
        info: "border-sky-500/30 bg-sky-500/15 text-sky-300",
      },
      pill: {
        true: "rounded-full",
        false: "rounded-[var(--radius-control,4px)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
      pill: false,
    },
  },
);

export type BadgeTone =
  | "primary"
  | "secondary"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "destructive"
  | "neutral"
  | "info";

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  tone?: BadgeTone;
  pill?: boolean;
}

export function Badge({
  children,
  tone = "neutral",
  pill = false,
  title,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "badge",
        tone && `badge--${tone}`,
        badgeVariants({ tone, pill }),
        className,
      )}
      title={title}
      {...props}
    >
      {children}
    </span>
  );
}

/** @deprecated Use `Badge` instead. */
export const Tag = Badge;

export type PostStatus = "published" | "draft" | "scheduled" | "hidden";

export function StatusBadge({
  children,
  status,
  label,
  tone,
  compact = false,
  className = "",
}: {
  children?: React.ReactNode;
  status?: PostStatus | string;
  label?: React.ReactNode;
  tone?: "success" | "danger" | "warning" | "neutral";
  compact?: boolean;
  className?: string;
}) {
  const normalizedStatus = status || "draft";
  const defaultLabels: Record<string, string> = {
    published: "已发布",
    draft: "草稿",
    scheduled: "定时发布",
    hidden: "已隐藏",
  };

  const resolvedTone: "success" | "danger" | "warning" | "neutral" =
    tone ||
    (normalizedStatus === "published" || normalizedStatus === "active"
      ? "success"
      : normalizedStatus === "scheduled" || normalizedStatus === "draft"
        ? "warning"
        : normalizedStatus === "hidden"
          ? "neutral"
          : "neutral");

  const displayContent =
    children || label || defaultLabels[normalizedStatus] || normalizedStatus;

  return (
    <Badge
      tone={resolvedTone}
      pill
      className={cn(
        "status-badge",
        `status-badge--${normalizedStatus}`,
        compact && "px-2 py-0 text-[11px]",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          resolvedTone === "success" && "bg-emerald-400",
          resolvedTone === "danger" && "bg-red-400",
          resolvedTone === "warning" && "bg-amber-400",
          resolvedTone === "neutral" && "bg-zinc-400",
        )}
        aria-hidden="true"
      />
      {displayContent}
    </Badge>
  );
}
