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
        <Heading level={2} className="text-lg">
          {title}
        </Heading>
        <Text size="sm" tone="muted" className="mt-1 max-w-3xl">
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
    <Card padding="none" className="overflow-hidden">
      <CardHeader className="border-b p-6">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <Text size="xs" tone="muted">
            {description}
          </Text>
        </div>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}
