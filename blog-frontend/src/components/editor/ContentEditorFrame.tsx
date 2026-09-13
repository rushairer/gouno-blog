import type React from "react";
import { cn } from "@gouno/ui";
import { Card } from "@gouno/ui/core";
import "../../styles/editor.css";

export function ContentEditorFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      padding="none"
      className={cn("editor-page gap-0 overflow-clip", className)}
    >
      {children}
    </Card>
  );
}

export function EditorCommandBar({ children }: { children: React.ReactNode }) {
  return (
    <header className="editor-commandbar flex flex-col gap-3 border-b px-6 py-4 lg:flex-row lg:items-center">
      {children}
    </header>
  );
}

export function EditorCommandActions({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "editor-command-actions flex flex-wrap items-center gap-2 lg:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AiWritingPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="editor-ai-writing-panel" aria-label="AI 写作与润色">
      {children}
    </section>
  );
}

export function AiImageGenerationPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="editor-ai-image-panel" aria-label="AI 文生图插画">
      {children}
    </section>
  );
}
