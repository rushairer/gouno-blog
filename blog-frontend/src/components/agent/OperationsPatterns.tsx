import type { ReactNode } from "react";
import { Button, Text } from "@gouno/ui/core";

export type OperationsSummaryItem = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
};

export function OperationsObjectRow({
  title,
  status,
  meta,
  summary,
  signals,
  leading,
  selected = false,
  onClick,
  ariaLabel,
}: {
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  summary?: ReactNode;
  signals?: ReactNode;
  leading?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <Button
      variant="ghost"
      block
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={[
        "group relative h-auto items-stretch justify-start whitespace-normal rounded-none border-b border-l-2 px-4 py-4 text-left transition-colors last:border-b-0",
        "focus-visible:ring-inset",
        selected
          ? "border-l-primary bg-primary/[0.08] hover:bg-primary/[0.08]"
          : "border-l-transparent hover:bg-muted/45",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="flex w-full min-w-0 items-start gap-3">
        {leading ? (
          <span
            className={[
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
              selected
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-border bg-muted/35 text-muted-foreground group-hover:text-foreground",
            ].join(" ")}
            aria-hidden="true"
          >
            {leading}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 items-start justify-between gap-3">
            <strong className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground">
              {title}
            </strong>
            {status ? <span className="shrink-0 pt-px">{status}</span> : null}
          </span>
          {meta ? (
            <span className="block text-xs leading-4 text-muted-foreground">{meta}</span>
          ) : null}
          {summary ? (
            <span className="block text-sm leading-5 text-foreground/80">{summary}</span>
          ) : null}
          {signals ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {signals}
            </span>
          ) : null}
        </span>
      </span>
    </Button>
  );
}

export function OperationsSummaryStrip({
  items,
  ariaLabel,
}: {
  items: OperationsSummaryItem[];
  ariaLabel?: string;
}) {
  return (
    <dl
      className="grid border-y py-3 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x"
      aria-label={ariaLabel}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={[
            "min-w-0 py-2",
            index === 0 ? "xl:pr-5" : "xl:px-5",
            index === items.length - 1 ? "xl:pr-0" : "",
          ].join(" ")}
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 min-w-0 text-sm font-semibold text-foreground">
            {item.value}
          </dd>
          {item.detail ? (
            <Text size="xs" tone="muted" className="mt-1">
              {item.detail}
            </Text>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export function OperationsRegionHeading({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function OperationsMeta({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}
