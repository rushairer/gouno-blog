import type React from "react";
import { X } from "lucide-react";
import { classes } from "./classes";
import { IconButton } from "./Button";

export function Panel({
  children,
  className = "",
  as: Component = "section",
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
} & Record<string, unknown>) {
  return (
    <Component className={`panel ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

export function WorkspacePanel({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={classes("panel", "workspace-panel", className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function ActionGroup({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={classes("action-group", className)}>{children}</div>;
}

export function TableContainer({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={classes("table-scroll", className)}>{children}</div>;
}

export function PanelHeader({
  title,
  description,
  actions,
  headingLevel = 2,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <header className="panel-header">
      <div className="panel-header__copy">
        <Heading>{title}</Heading>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <ActionGroup>{actions}</ActionGroup> : null}
    </header>
  );
}

export function EditorPanel({
  title,
  description,
  icon,
  closeLabel,
  onClose,
  children,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <WorkspacePanel className={classes("editor-panel", className)}>
      <PanelHeader
        title={
          <span className="editor-panel__title">
            {icon}
            {title}
          </span>
        }
        description={description}
        actions={
          <IconButton type="button" label={closeLabel} onClick={onClose}>
            <X />
          </IconButton>
        }
      />
      {children}
    </WorkspacePanel>
  );
}
