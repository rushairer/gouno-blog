import { forwardRef } from "react";
import type React from "react";
import { Link } from "react-router-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { classes } from "./classes";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "link"
  | "default"
  | "destructive"
  | "outline";

/**
 * Canonical sizes are sm/default/lg/icon. The legacy regular/base/compact
 * aliases remain supported while feature code migrates to the shared contract.
 */
export type ButtonSize =
  | "sm"
  | "default"
  | "lg"
  | "icon"
  | "regular"
  | "base"
  | "compact";
export type ButtonIconPosition = "left" | "right";

export const buttonVariants = cva(
  "btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        primary: "btn-primary",
        default: "btn-primary",
        secondary: "btn-secondary",
        danger: "btn-danger",
        destructive: "btn-danger",
        ghost: "btn-ghost",
        outline: "btn-secondary",
        link: "btn-link",
      },
      size: {
        regular: "btn--default",
        base: "btn--default",
        default: "btn--default",
        compact: "btn--compact",
        sm: "btn--compact",
        lg: "btn--large rounded-lg",
        icon: "btn--icon",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    /** Rendered in the shared, fixed-size icon slot. */
    icon?: React.ReactNode;
    iconPosition?: ButtonIconPosition;
  };

export type ButtonLinkProps = React.ComponentPropsWithoutRef<typeof Link> &
  VariantProps<typeof buttonVariants> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    /** Rendered in the shared, fixed-size icon slot. */
    icon?: React.ReactNode;
    iconPosition?: ButtonIconPosition;
  };

export type IconButtonVariant =
  | "secondary"
  | "ghost"
  | "danger"
  | "primary"
  | "destructive"
  | "outline";

export type IconButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  /** Accessible name for an icon-only action. */
  label: string;
  /** Rendered in the shared, fixed-size icon slot. */
  icon: React.ReactNode;
  size?: ButtonSize;
  variant?: IconButtonVariant;
  loading?: boolean;
};

export type IconButtonLinkProps = Omit<
  React.ComponentPropsWithoutRef<typeof Link>,
  "children"
> & {
  /** Accessible name for an icon-only link. */
  label: string;
  /** Rendered in the shared, fixed-size icon slot. */
  icon: React.ReactNode;
  size?: ButtonSize;
  variant?: IconButtonVariant;
  disabled?: boolean;
};

function iconButtonSizeClass(size: ButtonSize) {
  if (size === "compact" || size === "sm") return "icon-button--compact";
  if (size === "lg") return "icon-button--large";
  return "icon-button--default";
}

export function buttonClassName({
  variant = "secondary",
  size = "default",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(buttonVariants({ variant, size }), className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "default",
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
          <span className="btn__spinner shrink-0" aria-hidden="true" />
        ) : icon && iconPosition === "left" ? (
          <span className="btn__icon shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children ? (
          <span className="btn__label min-w-0">{children}</span>
        ) : null}
        {!loading && icon && iconPosition === "right" ? (
          <span className="btn__icon shrink-0" aria-hidden="true">
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
      size = "default",
      className = "",
      disabled = false,
      icon,
      iconPosition = "left",
      children,
      onClick,
      ...props
    },
    ref,
  ) {
    return (
      <Link
        ref={ref}
        className={buttonClassName({
          variant,
          size,
          className: classes(disabled && "is-disabled", className),
        })}
        aria-disabled={disabled ? "true" : undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        {...props}
      >
        {icon && iconPosition === "left" ? (
          <span className="btn__icon shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children ? (
          <span className="btn__label min-w-0">{children}</span>
        ) : null}
        {icon && iconPosition === "right" ? (
          <span className="btn__icon shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </Link>
    );
  },
);

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      size = "default",
      variant = "ghost",
      className = "",
      loading = false,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    const normalizedVariant =
      variant === "destructive"
        ? "danger"
        : variant === "outline"
          ? "secondary"
          : variant;
    return (
      <button
        ref={ref}
        type={type}
        className={classes(
          "icon-button",
          iconButtonSizeClass(size),
          `icon-button--${normalizedVariant}`,
          loading && "is-loading",
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-label={label}
        title={label}
        {...props}
      >
        {loading ? (
          <span className="btn__spinner shrink-0" aria-hidden="true" />
        ) : (
          <span className="icon-button__icon shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
      </button>
    );
  },
);

export const IconButtonLink = forwardRef<
  HTMLAnchorElement,
  IconButtonLinkProps
>(function IconButtonLink(
  {
    icon,
    label,
    size = "default",
    variant = "ghost",
    className = "",
    disabled = false,
    onClick,
    ...props
  },
  ref,
) {
  const normalizedVariant =
    variant === "destructive"
      ? "danger"
      : variant === "outline"
        ? "secondary"
        : variant;
  return (
    <Link
      ref={ref}
      className={classes(
        "icon-button",
        iconButtonSizeClass(size),
        `icon-button--${normalizedVariant}`,
        disabled && "is-disabled",
        className,
      )}
      aria-label={label}
      aria-disabled={disabled ? "true" : undefined}
      tabIndex={disabled ? -1 : undefined}
      title={label}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      <span className="icon-button__icon shrink-0" aria-hidden="true">
        {icon}
      </span>
    </Link>
  );
});

export function ChoiceButton({
  selected = false,
  children,
  className = "",
  ...props
}: Omit<ButtonProps, "variant"> & { selected?: boolean }) {
  return (
    <Button
      {...props}
      variant="ghost"
      className={classes("choice-button", selected && "is-selected", className)}
      aria-pressed={selected}
    >
      {children}
    </Button>
  );
}
