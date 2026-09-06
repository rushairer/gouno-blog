import type { ReactNode } from "react";
import { cn } from "./lib/utils";
import { PageHeader, Panel, PanelHeader } from "./layout";

export function DashboardTemplate({
  title,
  description,
  actions,
  stateControls,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  stateControls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-6", className)}>
      <PageHeader title={title} description={description} actions={actions} />
      {stateControls}
      {children}
    </div>
  );
}

export function ListPageTemplate({
  title,
  description,
  action,
  toolbar,
  stateControls,
  panel = true,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  toolbar?: ReactNode;
  stateControls?: ReactNode;
  panel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={title} description={description} action={action} />
      {stateControls}
      {panel ? (
        <Panel>
          {toolbar ? <PanelHeader title="列表" actions={toolbar} /> : null}
          {children}
        </Panel>
      ) : (
        children
      )}
    </div>
  );
}

export function EditorWorkspaceTemplate({
  outline,
  canvas,
  inspector,
  className,
}: {
  outline?: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-6 xl:grid-cols-[200px_minmax(0,1fr)_320px]",
        className,
      )}
    >
      {outline ? <Panel className="hidden xl:block">{outline}</Panel> : null}
      {canvas}
      {inspector}
    </div>
  );
}

export function ResponsiveList({
  table,
  mobile,
}: {
  table: ReactNode;
  mobile: ReactNode;
}) {
  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="grid gap-3 md:hidden">{mobile}</div>
    </>
  );
}
