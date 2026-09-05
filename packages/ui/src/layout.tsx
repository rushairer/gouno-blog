import { type ReactNode, type ElementType, type HTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "./lib/utils";
import { IconButton } from "./actions";
export function Panel({
  as: Component = "section",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <Component
      {...props}
      data-slot="panel"
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-lg border bg-card p-4 text-card-foreground md:p-6",
        className,
      )}
    >
      {children}
    </Component>
  );
}
export const WorkspacePanel = Panel;
export function PanelHeader({
  title,
  description,
  actions,
  action,
  headingLevel = 2,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <header
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className="text-base font-semibold tracking-tight">
          {title}
        </Heading>
        {description ? (
          <div className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {actions || action ? (
        <ActionGroup>{actions || action}</ActionGroup>
      ) : null}
    </header>
  );
}
export function PanelBody({
  stack,
  flush: _flush,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { stack?: boolean; flush?: boolean }) {
  return (
    <div
      {...props}
      className={cn("min-w-0", stack && "flex flex-col gap-6", className)}
    />
  );
}
export function PlainSection({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 border-t py-5 first:border-0 first:pt-0",
        className,
      )}
    >
      {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      {children}
    </section>
  );
}
export function PageHeader({
  title,
  description,
  action,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {description ? (
          <div className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {action || actions ? (
        <ActionGroup>{action || actions}</ActionGroup>
      ) : null}
    </header>
  );
}
export const AdminPageHeader = PageHeader;
export function AdminPage({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot="admin-page"
      className={cn(
        "mx-auto flex w-full min-w-0 max-w-[1440px] flex-col gap-6",
        className,
      )}
    />
  );
}
export const ContentStack = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={cn("flex min-w-0 flex-col gap-6", className)} />
);
export const ActionGroup = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    {...props}
    className={cn("flex flex-wrap items-center gap-2", className)}
  />
);
export const FilterBar = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={cn("flex flex-wrap items-end gap-3", className)} />
);
export const TableContainer = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    {...props}
    className={cn("min-w-0 overflow-x-auto rounded-lg border", className)}
  />
);
export function SectionHeading({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return <PanelHeader title={title} action={action} className={className} />;
}
export function EditorPanel({
  title,
  description,
  icon,
  closeLabel,
  onClose,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
        }
        description={description}
        action={
          <IconButton label={closeLabel} icon={<X />} onClick={onClose} />
        }
      />
      {children}
    </Panel>
  );
}
export const DefinitionList = ({
  className,
  ...props
}: HTMLAttributes<HTMLDListElement>) => (
  <dl {...props} className={cn("divide-y divide-border", className)} />
);
export function DefinitionRow({
  label,
  children,
  mono,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2 py-3 sm:grid-cols-[minmax(140px,1fr)_2fr]",
        className,
      )}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words text-sm", mono && "font-mono")}>
        {children}
      </dd>
    </div>
  );
}
export const ListStack = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={cn("divide-y divide-border", className)} />
);
export function ListRow({
  icon,
  title,
  meta,
  action,
  children,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-3 py-4", className)}>
      {icon ? (
        <span aria-hidden="true" className="text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {children || (
          <>
            <div className="break-words font-medium">{title}</div>
            <div className="text-sm text-muted-foreground">{meta}</div>
          </>
        )}
      </div>
      {action ? <ActionGroup>{action}</ActionGroup> : null}
    </div>
  );
}
export function ButtonGroup({
  align,
  compact: _compact,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { align?: string; compact?: boolean }) {
  return (
    <ActionGroup
      {...props}
      className={cn(align === "right" && "justify-end", className)}
    />
  );
}
