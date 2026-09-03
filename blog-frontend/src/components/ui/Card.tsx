import type React from "react";
import { classes } from "./classes";

export type CardVariant = "default" | "subtle" | "elevated";
export type CardPadding = "none" | "sm" | "base" | "lg";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
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
      className={classes(
        "ui-card",
        variant !== "default" && `ui-card--${variant}`,
        padding !== "base" && `ui-card--padding-${padding}`,
        interactive && "ui-card--interactive",
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
      <div className={classes("ui-card__header", className)}>{children}</div>
    );
  }

  return (
    <div className={classes("ui-card__header", className)}>
      <div>
        {title && <h3 className="ui-card__title">{title}</h3>}
        {description && <p className="ui-card__description">{description}</p>}
      </div>
      {action && <div className="ui-card__action">{action}</div>}
    </div>
  );
}

export function CardContent({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes("ui-card__content", className)}>{children}</div>
  );
}

export function CardFooter({
  children,
  className = "",
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes("ui-card__footer", className)}>{children}</div>
  );
}
