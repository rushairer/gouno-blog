import type React from "react";
import { cn } from "@gouno/ui";
import "../../styles/editor.css";

export function ContentEditorFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("editor-page", className)}>{children}</div>;
}

export function EditorCommandBar({ children }: { children: React.ReactNode }) {
  return <header className="editor-commandbar">{children}</header>;
}

export function EditorCommandActions({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("editor-command-actions", className)}>{children}</div>
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
