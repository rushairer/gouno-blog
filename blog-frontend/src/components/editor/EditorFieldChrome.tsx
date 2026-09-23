import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@gouno/ui/core";

export function InspectorSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details open className="relative border-b py-4 last:border-b-0">
      <summary className="cursor-pointer select-none pe-12 type-body-sm type-weight-semibold">
        {title}
      </summary>
      {action ? (
        <div className="absolute end-0 top-2.5 z-10">{action}</div>
      ) : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </details>
  );
}

export function FieldActionHeader({
  label,
  actionLabel,
  onAction,
  disabled = false,
  loading = false,
  required = false,
}: {
  label: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
}) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
      <div className="type-body-sm type-weight-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        size="small"
        variant="text"
        icon={<Sparkles />}
        onClick={onAction}
        disabled={disabled || loading}
        loading={loading}
        aria-label={actionLabel}
        title={actionLabel}
        className="size-8 px-0"
      />
    </div>
  );
}
