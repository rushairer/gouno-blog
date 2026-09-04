import type React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export type BadgeTone =
  | "brand"
  | "primary"
  | "secondary"
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "destructive";

export const badgeVariants = cva(
  "badge inline-flex items-center whitespace-nowrap border text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      tone: {
        brand: "badge--brand",
        primary: "badge--brand",
        secondary: "badge--neutral",
        neutral: "badge--neutral",
        success: "badge--success",
        warning: "badge--warning",
        danger: "badge--danger",
        destructive: "badge--danger",
      },
      pill: {
        true: "badge--pill",
        false: "",
      },
    },
    defaultVariants: {
      tone: "neutral",
      pill: false,
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  tone?: BadgeTone;
  pill?: boolean;
  children: React.ReactNode;
}

export function Badge({
  children,
  tone = "neutral",
  pill = false,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, pill }), className)} {...props}>
      {children}
    </span>
  );
}

export type PostStatus = "published" | "draft" | "scheduled" | "hidden";

const statusTones: Record<string, BadgeTone> = {
  published: "success",
  draft: "neutral",
  scheduled: "warning",
  hidden: "danger",
};

export function StatusBadge({
  status = "draft",
  className = "",
  label,
}: {
  status?: PostStatus | string;
  className?: string;
  label?: React.ReactNode;
}) {
  const normalizedStatus = status || "draft";
  const defaultLabels: Record<string, string> = {
    published: "已发布",
    draft: "草稿",
    scheduled: "定时发布",
    hidden: "已隐藏",
  };
  return (
    <Badge
      tone={statusTones[normalizedStatus] || "neutral"}
      className={cn(
        "status-badge",
        `status-badge--${normalizedStatus}`,
        className,
      )}
    >
      {label || defaultLabels[normalizedStatus] || normalizedStatus}
    </Badge>
  );
}
