import React from "react";
import { cn } from "../../lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular" | "card";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  variant = "text",
  width,
  height,
  className = "",
  style,
  ...props
}: SkeletonProps) {
  const dynamicStyle: React.CSSProperties = {
    ...style,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };

  return (
    <div
      className={cn(
        "skeleton animate-pulse bg-muted",
        `skeleton--${variant}`,
        variant === "circular" && "rounded-full skeleton-circular",
        variant === "rectangular" && "rounded-md skeleton-rectangular",
        variant === "text" && "h-4 rounded-[4px] skeleton-text",
        variant === "card" && "h-32 rounded-xl skeleton-card",
        className,
      )}
      style={dynamicStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className = "",
  label = "正在载入数据…",
}: {
  rows?: number;
  columns?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("table-skeleton w-full space-y-3 p-4", className)}
      aria-label={label}
      role="status"
    >
      <div className="flex gap-4 border-b border-border pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`th-${i}`}
            variant="text"
            height={16}
            className="flex-1"
          />
        ))}
      </div>
      <div className="space-y-3 pt-2">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`tr-${rowIndex}`}
            className="table-skeleton-row flex gap-4 py-2 border-b border-border/50 last:border-0"
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={`td-${rowIndex}-${colIndex}`}
                variant="text"
                height={16}
                width={
                  colIndex === 0
                    ? "70%"
                    : colIndex === columns - 1
                      ? "40%"
                      : "85%"
                }
                className="flex-1"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArticleListSkeleton({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("article-list-skeleton space-y-6", className)}
      aria-label="正在载入文章列表…"
      role="status"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`article-skel-${index}`}
          className="article-skeleton-card space-y-3 p-4 rounded-xl border border-border bg-card"
        >
          <Skeleton variant="text" height={24} width="70%" />
          <Skeleton variant="text" height={16} width="95%" />
          <Skeleton variant="text" height={14} width="35%" />
        </div>
      ))}
    </div>
  );
}
