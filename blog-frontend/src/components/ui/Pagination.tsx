import type React from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { classes } from "./classes";
import { Button, IconButton } from "./Button";

export function Pagination({
  page,
  pages,
  onChange,
  label = "分页导航",
  className = "",
  mode = "numbers",
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label?: string;
  className?: string;
  mode?: "numbers" | "compact";
}) {
  if (pages <= 1) return null;
  if (mode === "compact") {
    return (
      <nav
        className={classes("pagination-compact", className)}
        aria-label={label}
      >
        <IconButton
          label="上一页"
          icon={<ChevronLeft />}
          size="compact"
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
        />
        <span aria-live="polite">
          {page} / {pages}
        </span>
        <IconButton
          label="下一页"
          icon={<ChevronRight />}
          size="compact"
          disabled={page >= pages}
          onClick={() => onChange(Math.min(pages, page + 1))}
        />
      </nav>
    );
  }
  return (
    <nav className={classes("pagination", className)} aria-label={label}>
      {Array.from({ length: pages }, (_, index) => index + 1).map((item) => (
        <Button
          key={item}
          type="button"
          variant={item === page ? "primary" : "secondary"}
          className="pagination__page"
          aria-current={item === page ? "page" : undefined}
          onClick={() => onChange(item)}
        >
          {item}
        </Button>
      ))}
    </nav>
  );
}

export function BulkActionBar({
  selectionLabel,
  onAIAssist,
  onCancel,
  children,
  aiLabel = "交给 AI",
  cancelLabel = "取消",
  className = "",
}: {
  selectionLabel: React.ReactNode;
  onAIAssist?: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
  aiLabel?: string;
  cancelLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={classes("bulk-action-bar", className)}
      role="toolbar"
      aria-label="批量操作"
    >
      <strong className="bulk-action-bar__summary">{selectionLabel}</strong>
      <div className="bulk-action-bar__actions">
        {onAIAssist ? (
          <Button
            className="bulk-action-bar__ai"
            variant="secondary"
            size="compact"
            type="button"
            onClick={onAIAssist}
            icon={<Sparkles />}
          >
            {aiLabel}
          </Button>
        ) : null}
        {children}
        <Button variant="ghost" size="compact" type="button" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
