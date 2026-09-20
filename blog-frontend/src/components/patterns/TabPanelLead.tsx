import type { ReactNode } from "react";
import { Heading, Text } from "@gouno/ui/core";

export function TabPanelLead({
  title,
  description,
  actions,
  dataSlot = "tab-panel-lead",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  dataSlot?: string;
}) {
  if (!title && !description && !actions) return null;

  return (
    <div
      data-slot={dataSlot}
      data-pattern="tab-panel-lead"
      className="flex min-h-9 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0">
        {title ? <Heading level={2}>{title}</Heading> : null}
        {description ? (
          <Text
            tone="muted"
            size="sm"
            leading="relaxed"
            className={title ? "mt-1 max-w-3xl" : "max-w-3xl"}
          >
            {description}
          </Text>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function TabPanelFeedback({ children }: { children?: ReactNode }) {
  if (!children) return null;

  return (
    <div
      data-slot="tab-panel-feedback"
      data-pattern="tab-panel-feedback"
      className="flex flex-col gap-3"
    >
      {children}
    </div>
  );
}
