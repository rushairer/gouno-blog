import type React from "react";
import { classes } from "./classes";

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
      className={classes("skeleton", `skeleton--${variant}`, className)}
      style={dynamicStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 5,
  className = "",
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={classes("table-skeleton-wrap", className)}
      aria-label="正在载入数据…"
      role="status"
    >
      <div className="table-skeleton-header">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`th-${i}`}
            variant="text"
            height={16}
            className="table-skeleton-th"
          />
        ))}
      </div>
      <div className="table-skeleton-body">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`tr-${rowIndex}`} className="table-skeleton-row">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={`td-${rowIndex}-${colIndex}`}
                variant="text"
                height={16}
                width={
                  colIndex === 0
                    ? "28px"
                    : colIndex === 1
                      ? "65%"
                      : colIndex === columns - 1
                        ? "40%"
                        : "85%"
                }
                className="table-skeleton-td"
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
      className={classes("article-list-skeleton", className)}
      aria-label="正在载入文章列表…"
      role="status"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={`article-skel-${index}`} className="article-skeleton-card">
          <Skeleton variant="text" height={24} width="70%" />
          <Skeleton variant="text" height={16} width="95%" />
          <Skeleton variant="text" height={14} width="35%" />
        </div>
      ))}
    </div>
  );
}
