import type React from "react";
import { classes } from "../ui";

export function ContentEditorFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={classes("editor-page", className)}>{children}</div>;
}

export function EditorCommandBar({ children }: { children: React.ReactNode }) {
  return <header className="editor-commandbar">{children}</header>;
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
