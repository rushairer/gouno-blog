import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormActions,
  Heading,
  Text,
} from "@gouno/ui/core";

export function DedicatedEditorLead({
  title,
  description,
  backLabel,
  onBack,
  status,
  actions,
}: {
  title: ReactNode;
  description: ReactNode;
  backLabel: ReactNode;
  onBack: () => void;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      data-slot="dedicated-editor-lead"
      data-pattern="dedicated-editor-lead"
      className="flex flex-col gap-4 border-b pb-5"
    >
      <div>
        <Button
          type="button"
          size="small"
          variant="ghost"
          icon={<ArrowLeft />}
          onClick={onBack}
        >
          {backLabel}
        </Button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Heading level={2} variant="task">
              {title}
            </Heading>
            {status}
          </div>
          <Text
            size="sm"
            tone="muted"
            leading="relaxed"
            className="mt-1 max-w-3xl"
          >
            {description}
          </Text>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function DedicatedEditorLayout({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div
      data-slot="dedicated-editor-layout"
      data-pattern="dedicated-editor-layout"
      className={
        secondary
          ? "grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]"
          : "min-w-0"
      }
    >
      <div className="flex min-w-0 flex-col gap-5">{primary}</div>
      {secondary ? (
        <aside className="flex min-w-0 flex-col gap-5">{secondary}</aside>
      ) : null}
    </div>
  );
}

export function DedicatedEditorSection({
  title,
  description,
  actions,
  contentClassName = "p-6",
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card
      padding="none"
      data-slot="dedicated-editor-section"
      data-pattern="dedicated-editor-section"
      className="overflow-hidden"
    >
      <CardHeader className="border-b p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description ? (
              <Text size="xs" tone="muted" leading="relaxed" className="mt-1">
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
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

export function DedicatedEditorActions({ children }: { children: ReactNode }) {
  return (
    <div data-slot="dedicated-editor-actions">
      <FormActions>{children}</FormActions>
    </div>
  );
}
