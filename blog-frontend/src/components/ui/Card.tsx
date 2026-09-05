import React from "react";
import { cn } from "../../lib/utils";

export type CardVariant = "default" | "subtle" | "elevated";
export type CardPadding = "none" | "sm" | "base" | "lg";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
  as?: React.ElementType;
}

export function Card({
  children,
  className = "",
  variant = "default",
  padding = "base",
  interactive = false,
  as: Component = "div",
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        "ui-card rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all",
        `ui-card--${variant}`,
        `ui-card--padding-${padding}`,
        interactive && "ui-card--interactive",
        variant === "subtle" && "bg-card/50 border-border/60",
        variant === "elevated" && "bg-[#1c232d] shadow-lg border-border",
        padding === "none" && "p-0",
        padding === "sm" && "p-4",
        padding === "base" && "p-6",
        padding === "lg" && "p-8",
        interactive &&
          "cursor-pointer hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      tabIndex={interactive ? 0 : undefined}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  if (children) {
    return (
      <div className={cn("flex flex-col space-y-1.5 p-6", className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-start justify-between gap-4 p-6", className)}
    >
      <div className="space-y-1.5 min-w-0 flex-1">
        {title && (
          <h3 className="text-lg font-semibold leading-none tracking-tight text-foreground">
            {title}
          </h3>
        )}
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-none tracking-tight text-foreground",
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
  );
}

export function CardContent({
  children,
  className = "",
  flush = false,
}: {
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div className={cn("p-6 pt-0", flush && "p-0", className)}>{children}</div>
  );
}

export function CardFooter({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center p-6 pt-0", className)}>
      {children}
    </div>
  );
}
