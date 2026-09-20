import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Heading,
  Text,
} from "@gouno/ui/core";

export function AISettingsEditorHeader({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <Heading level={2} variant="subsection">
          {title}
        </Heading>
        <Text size="sm" tone="muted">
          {description}
        </Text>
      </div>
    </div>
  );
}

export function AISettingsEditorSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card
      padding="none"
      data-slot="ai-settings-editor-form-section"
      data-pattern="editor-form-section"
      className="overflow-hidden"
    >
      <CardHeader className="border-b p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <Text
              size="xs"
              tone="muted"
              leading="relaxed"
              className="mt-1"
            >
              {description}
            </Text>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}
