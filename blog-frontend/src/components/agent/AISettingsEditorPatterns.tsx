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

export function AISettingsPanelLead({
  title,
  description,
  actions,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  if (!title && !description && !actions) return null;

  return (
    <div
      data-slot="ai-settings-tab-panel-lead"
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

export function AISettingsPanelFeedback({
  children,
}: {
  children?: ReactNode;
}) {
  if (!children) return null;
  return (
    <div
      data-slot="ai-settings-tab-panel-feedback"
      data-pattern="tab-panel-feedback"
      className="flex flex-col gap-3"
    >
      {children}
    </div>
  );
}

export function AISettingsEditorHeader({
  title,
  description,
  backLabel,
  onBack,
}: {
  title: ReactNode;
  description: ReactNode;
  backLabel: ReactNode;
  onBack: () => void;
}) {
  return (
    <header
      data-slot="ai-settings-dedicated-editor-lead"
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
      <div className="min-w-0">
        <Heading level={2} variant="task">
          {title}
        </Heading>
        <Text
          size="sm"
          tone="muted"
          leading="relaxed"
          className="mt-1 max-w-3xl"
        >
          {description}
        </Text>
      </div>
    </header>
  );
}

export function AISettingsEditorSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      padding="none"
      data-slot="ai-settings-dedicated-editor-section"
      data-pattern="dedicated-editor-section"
      className="overflow-hidden"
    >
      <CardHeader className="border-b p-6">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <Text size="xs" tone="muted" leading="relaxed">
            {description}
          </Text>
        </div>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}

export function AISettingsEditorActions({ children }: { children: ReactNode }) {
  return (
    <div data-slot="ai-settings-dedicated-editor-actions">
      <FormActions>{children}</FormActions>
    </div>
  );
}
