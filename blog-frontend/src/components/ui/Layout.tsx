import type React from "react";
import { cn } from "../../lib/utils";
import { Panel } from "./Panel";
import { Feedback } from "./Feedback";

export function PageHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/60 mb-6",
        className,
      )}
    >
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 mt-2 sm:mt-0">{action}</div>}
    </div>
  );
}

export function AdminPage({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6 max-w-7xl mx-auto p-6 md:p-8", className)}>
      {children}
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
  className = "",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/60",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}

export function AdminPageState({
  title,
  description,
  label,
}: {
  title: string;
  description?: React.ReactNode;
  label: string;
}) {
  return (
    <AdminPage>
      <AdminPageHeader title={title} description={description} />
      <Feedback type="info">{label}</Feedback>
    </AdminPage>
  );
}

export function FilterBar({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return <Panel className={cn("p-4 mb-6", className)}>{children}</Panel>;
}

export function ContentStack({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

export function SectionHeading({
  title,
  action,
  className = "",
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-center justify-between pb-3 border-b border-border/60 mb-4",
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-foreground tracking-tight">
        {title}
      </h2>
      {action}
    </header>
  );
}
