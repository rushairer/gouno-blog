import type React from "react";
import { classes } from "./classes";

export type BadgeTone =
  | "brand"
  | "primary"
  | "secondary"
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "destructive";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
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
  const normalizedTone =
    tone === "primary"
      ? "brand"
      : tone === "secondary"
        ? "neutral"
        : tone === "destructive"
          ? "danger"
          : tone;

  return (
    <span
      className={classes(
        "badge",
        normalizedTone !== "neutral" && `badge--${normalizedTone}`,
        pill && "badge--pill",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export type PostStatus = "published" | "draft" | "scheduled" | "hidden";

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
    <span
      className={classes(
        "status-badge",
        `status-badge--${normalizedStatus}`,
        className,
      )}
    >
      {label || defaultLabels[normalizedStatus] || normalizedStatus}
    </span>
  );
}
