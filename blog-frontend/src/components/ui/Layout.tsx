import type React from "react";
import { classes } from "./classes";
import { Panel } from "./Panel";
import { LoadingState } from "./Feedback";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-header__action">{action}</div>}
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
  return <div className={`admin-page ${className}`.trim()}>{children}</div>;
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-heading">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
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
      <LoadingState label={label} />
    </AdminPage>
  );
}

export function FilterBar({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return <Panel className={classes("filter-bar", className)}>{children}</Panel>;
}

export function ContentStack({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={classes("content-stack", className)}>{children}</div>;
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
    <header className={classes("section-heading", className)}>
      <h2>{title}</h2>
      {action}
    </header>
  );
}
