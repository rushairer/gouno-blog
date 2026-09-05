import type React from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
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
        className={cn(
          "pagination pagination-compact inline-flex items-center gap-2",
          className,
        )}
        aria-label={label}
      >
        <IconButton
          label="上一页"
          icon={<ChevronLeft className="h-4 w-4" />}
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
        />
        <span
          className="text-xs text-muted-foreground font-medium"
          aria-live="polite"
        >
          {page} / {pages}
        </span>
        <IconButton
          label="下一页"
          icon={<ChevronRight className="h-4 w-4" />}
          size="sm"
          disabled={page >= pages}
          onClick={() => onChange(Math.min(pages, page + 1))}
        />
      </nav>
    );
  }
  return (
    <nav
      className={cn(
        "pagination flex flex-wrap items-center justify-center gap-1.5 py-4",
        className,
      )}
      aria-label={label}
    >
      {Array.from({ length: pages }, (_, index) => index + 1).map((item) => (
        <Button
          key={item}
          type="button"
          variant={item === page ? "primary" : "secondary"}
          size="sm"
          className="min-w-[32px] px-2.5"
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
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center justify-between gap-4 rounded-xl border border-border bg-card/95 p-3 px-5 text-sm text-card-foreground shadow-2xl backdrop-blur-md max-w-xl w-[calc(100%-2rem)]",
        className,
      )}
      role="toolbar"
      aria-label="批量操作"
    >
      <strong className="text-sm font-semibold text-foreground">
        {selectionLabel}
      </strong>
      <div className="flex items-center gap-2">
        {onAIAssist ? (
          <Button
            variant="secondary"
            size="sm"
            type="button"
            className="bulk-action-bar__ai"
            onClick={onAIAssist}
            icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
          >
            {aiLabel}
          </Button>
        ) : null}
        {children}
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
