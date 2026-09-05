import type React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
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
    <Component
      className={cn(
        "rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    >
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
      className={cn(
        "rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm space-y-6",
        className,
      )}
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
  return (
    <div className={cn("flex items-center gap-2", className)}>{children}</div>
  );
}

export function TableContainer({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-lg border border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  headingLevel = 2,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <header
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/60",
        className,
      )}
    >
      <div className="space-y-1">
        <Heading className="text-lg font-semibold text-foreground tracking-tight">
          {title}
        </Heading>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
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
    <WorkspacePanel className={cn("editor-panel relative", className)}>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
        }
        description={description}
        actions={
          <IconButton
            type="button"
            label={closeLabel}
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
          />
        }
      />
      {children}
    </WorkspacePanel>
  );
}
