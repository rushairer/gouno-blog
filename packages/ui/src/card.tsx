import { type HTMLAttributes, type ReactNode, type ElementType } from "react";
import { cn } from "./lib/utils";
export function Card({
  as: Component = "section",
  variant = "default",
  padding = "base",
  interactive,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  variant?: "default" | "subtle" | "elevated";
  padding?: "none" | "sm" | "base" | "lg";
  interactive?: boolean;
}) {
  return (
    <Component
      {...props}
      data-slot="card"
      className={cn(
        "ui-card min-w-0 rounded-lg border bg-card text-card-foreground",
        padding === "sm"
          ? "p-4"
          : padding === "lg"
            ? "p-8"
            : padding === "none"
              ? "p-0"
              : "p-6",
        variant === "subtle" && "bg-muted",
        variant === "elevated" && "shadow-lg ui-card--elevated",
        padding === "lg" && "ui-card--padding-lg",
        interactive && "cursor-pointer hover:border-primary",
        className,
      )}
    />
  );
}
export function CardHeader({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="card-header"
      className={cn("flex items-start justify-between gap-4", className)}
    >
      {children || (
        <>
          <div>
            {title ? <CardTitle>{title}</CardTitle> : null}
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </div>
          {action}
        </>
      )}
    </header>
  );
}
export const CardTitle = ({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    {...props}
    data-slot="card-title"
    className={cn("text-base font-semibold", className)}
  />
);
export const CardDescription = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p
    {...props}
    className={cn("mt-1 text-sm text-muted-foreground", className)}
  />
);
export const CardContent = ({
  flush: _flush,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { flush?: boolean }) => (
  <div {...props} className={cn("min-w-0", className)} />
);
export const CardFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <footer
    {...props}
    className={cn("flex flex-wrap items-center gap-3", className)}
  />
);
