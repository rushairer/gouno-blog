import { forwardRef } from "react";
import type React from "react";
import { Link } from "react-router-dom";
import { classes } from "./classes";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "regular" | "compact";
export type ButtonIconPosition = "left" | "right";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Rendered in the shared, fixed-size icon slot. */
  icon?: React.ReactNode;
  iconPosition?: ButtonIconPosition;
};

export type ButtonLinkProps = React.ComponentPropsWithoutRef<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rendered in the shared, fixed-size icon slot. */
  icon?: React.ReactNode;
  iconPosition?: ButtonIconPosition;
};

export function buttonClassName({
  variant = "secondary",
  size = "regular",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return classes(
    "btn",
    `btn-${variant}`,
    size === "compact" && "btn--compact",
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "regular",
      className = "",
      loading = false,
      disabled,
      icon,
      iconPosition = "left",
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonClassName({
          variant,
          size,
          className: classes(loading && "is-loading", className),
        })}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <span className="btn__spinner" aria-hidden="true" />
        ) : icon && iconPosition === "left" ? (
          <span className="btn__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children ? <span className="btn__label">{children}</span> : null}
        {!loading && icon && iconPosition === "right" ? (
          <span className="btn__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </button>
    );
  },
);

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    {
      variant = "secondary",
      size = "regular",
      className = "",
      icon,
      iconPosition = "left",
      children,
      ...props
    },
    ref,
  ) {
    return (
      <Link
        ref={ref}
        className={buttonClassName({ variant, size, className })}
        {...props}
      >
        {icon && iconPosition === "left" ? (
          <span className="btn__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children ? <span className="btn__label">{children}</span> : null}
        {icon && iconPosition === "right" ? (
          <span className="btn__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </Link>
    );
  },
);

export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function IconButton({ children, label, className = "", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={classes("icon-button", className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
});
