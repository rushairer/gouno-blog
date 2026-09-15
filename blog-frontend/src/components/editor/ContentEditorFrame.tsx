import {
  Children,
  isValidElement,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@gouno/ui";
import { Card } from "@gouno/ui/core";
import "../../styles/editor.css";

function isEditorPageFeedback(child: ReactNode): boolean {
  if (!isValidElement<{ className?: string }>(child)) return false;
  return (child.props.className ?? "")
    .split(/\s+/)
    .includes("editor-page-feedback");
}

export function ContentEditorFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const childList = Children.toArray(children);
  const feedback = childList.filter(isEditorPageFeedback);
  const frameChildren = childList.filter(
    (child) => !isEditorPageFeedback(child),
  );

  return (
    <div className="editor-page flex min-w-0 flex-col gap-6 [&>.editor-page-feedback]:mb-0">
      {feedback}
      <Card
        padding="none"
        className={cn("min-w-0 gap-0 overflow-clip", className)}
      >
        {frameChildren}
      </Card>
    </div>
  );
}

export function EditorCommandBar({ children }: { children: ReactNode }) {
  return (
    <header className="editor-commandbar flex flex-col gap-3 border-b px-6 py-4 lg:flex-row lg:items-center">
      {children}
    </header>
  );
}

export function EditorCommandActions({
  children,
  className = "",
}: HTMLAttributes<HTMLDivElement>) {
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

export function AiWritingPanel({ children }: { children: ReactNode }) {
  return (
    <section className="editor-ai-writing-panel" aria-label="AI 写作与润色">
      {children}
    </section>
  );
}

export function AiImageGenerationPanel({ children }: { children: ReactNode }) {
  return (
    <section className="editor-ai-image-panel" aria-label="AI 文生图插画">
      {children}
    </section>
  );
}
