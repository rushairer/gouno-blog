import React, { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "link"
  | "default"
  | "destructive"
  | "outline";

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
  "btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control,6px)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer active:scale-[0.985]",
  {
    variants: {
      variant: {
        default:
          "btn-primary bg-primary text-primary-foreground shadow-sm hover:bg-blue-600 active:bg-blue-700",
        primary:
          "btn-primary bg-primary text-primary-foreground shadow-sm hover:bg-blue-600 active:bg-blue-700",
        destructive:
          "btn-danger border border-destructive/30 bg-destructive/15 text-red-200 hover:bg-destructive/25 active:bg-destructive/35",
        danger:
          "btn-danger border border-destructive/30 bg-destructive/15 text-red-200 hover:bg-destructive/25 active:bg-destructive/35",
        outline:
          "btn-secondary border border-border bg-secondary text-foreground hover:bg-zinc-800 hover:border-zinc-600 active:bg-zinc-900",
        secondary:
          "btn-secondary border border-border bg-secondary text-foreground hover:bg-zinc-800 hover:border-zinc-600 active:bg-zinc-900",
        ghost:
          "btn-ghost text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-zinc-800",
        link: "btn-link text-primary underline-offset-4 hover:underline p-0 h-auto font-normal",
      },
      size: {
        default: "h-9 px-4 py-2",
        base: "h-9 px-4 py-2",
        regular: "h-9 px-4 py-2",
        sm: "btn-sm btn--compact h-8 rounded-[4px] px-3 text-xs",
        compact: "btn-sm btn--compact h-8 rounded-[4px] px-3 text-xs",
        lg: "h-11 rounded-lg px-8 text-base",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: ButtonIconPosition;
}

export interface ButtonLinkProps
  extends Omit<LinkProps, "to">, VariantProps<typeof buttonVariants> {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: ButtonIconPosition;
  disabled?: boolean;
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
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          buttonVariants({ variant, size }),
          loading && "cursor-wait opacity-80",
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0"
            aria-hidden="true"
          />
        ) : icon && iconPosition === "left" ? (
          <span
            className="btn__icon inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        {children ? (
          <span className="btn__label min-w-0">{children}</span>
        ) : null}
        {!loading && icon && iconPosition === "right" ? (
          <span
            className="btn__icon inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
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
      to,
      ...props
    },
    ref,
  ) {
    return (
      <Link
        ref={ref}
        to={to}
        className={cn(
          buttonVariants({ variant, size }),
          disabled && "pointer-events-none opacity-50",
          className,
        )}
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
          <span
            className="btn__icon inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        {children ? (
          <span className="btn__label min-w-0">{children}</span>
        ) : null}
        {icon && iconPosition === "right" ? (
          <span
            className="btn__icon inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </Link>
    );
  },
);

export type IconButtonVariant =
  | "secondary"
  | "ghost"
  | "danger"
  | "primary"
  | "destructive"
  | "outline";

export interface IconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  label: string;
  icon: React.ReactNode;
  size?: ButtonSize;
  variant?: IconButtonVariant;
  loading?: boolean;
}

export interface IconButtonLinkProps extends Omit<LinkProps, "children"> {
  to: string;
  label: string;
  icon: React.ReactNode;
  size?: ButtonSize;
  variant?: IconButtonVariant;
  disabled?: boolean;
}

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
    const normalizedVariant: ButtonVariant =
      variant === "destructive"
        ? "danger"
        : variant === "outline"
          ? "secondary"
          : variant;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "icon-button",
          `icon-button--${normalizedVariant}`,
          buttonVariants({ variant: normalizedVariant, size: "icon" }),
          loading && "cursor-wait opacity-80",
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-label={label}
        title={label}
        {...props}
      >
        {loading ? (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0"
            aria-hidden="true"
          />
        ) : (
          <span
            className="icon-button__icon inline-flex shrink-0 items-center justify-center"
            aria-hidden="true"
          >
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
    to,
    ...props
  },
  ref,
) {
  const normalizedVariant: ButtonVariant =
    variant === "destructive"
      ? "danger"
      : variant === "outline"
        ? "secondary"
        : variant;

  return (
    <Link
      ref={ref}
      to={to}
      className={cn(
        "icon-button",
        `icon-button--${normalizedVariant}`,
        buttonVariants({ variant: normalizedVariant, size: "icon" }),
        disabled && "pointer-events-none opacity-50",
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
      <span
        className="icon-button__icon inline-flex shrink-0 items-center justify-center"
        aria-hidden="true"
      >
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
      variant={selected ? "primary" : "ghost"}
      className={cn(
        "justify-start font-normal",
        selected && "font-medium shadow-sm",
        className,
      )}
      aria-pressed={selected}
    >
      {children}
    </Button>
  );
}
