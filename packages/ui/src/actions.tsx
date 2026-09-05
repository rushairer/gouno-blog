import {
  createContext,
  useContext,
  type ComponentType,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { LoaderCircle } from "lucide-react";
import { Button as PrimitiveButton } from "./components/ui/button";
import { cn } from "./lib/utils";
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
  "sm" | "default" | "lg" | "icon" | "regular" | "base" | "compact";
export type ButtonIconPosition = "left" | "right";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: ButtonIconPosition;
  ref?: Ref<HTMLButtonElement>;
}
const variants = {
  primary: "default",
  default: "default",
  secondary: "outline",
  outline: "outline",
  danger: "destructive",
  destructive: "destructive",
  ghost: "ghost",
  link: "link",
} as const;
const sizes = {
  sm: "sm",
  compact: "sm",
  default: "default",
  regular: "default",
  base: "default",
  lg: "lg",
  icon: "icon",
} as const;
export function Button({
  variant = "secondary",
  size = "default",
  loading = false,
  icon,
  iconPosition = "left",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <PrimitiveButton
      {...props}
      className={cn(
        `btn-${variant}`,
        size === "sm" || size === "compact" ? "btn-sm" : undefined,
        props.className,
      )}
      type={type}
      variant={variants[variant]}
      size={sizes[size]}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <LoaderCircle data-icon="inline-start" className="animate-spin" />
      ) : icon && iconPosition === "left" ? (
        <span className="btn__icon" data-icon="inline-start" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
      {!loading && icon && iconPosition === "right" ? (
        <span className="btn__icon" data-icon="inline-end" aria-hidden="true">
          {icon}
        </span>
      ) : null}
    </PrimitiveButton>
  );
}
export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  label: string;
  icon: ReactNode;
}
export function IconButton({
  label,
  size: _size,
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      className={cn("icon-button", `icon-button--${variant}`, props.className)}
      variant={variant}
      size="icon"
      aria-label={label}
      title={label}
    />
  );
}
interface LinkAdapterProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  ref?: Ref<HTMLAnchorElement>;
}
const LinkContext = createContext<ComponentType<LinkAdapterProps>>(
  ({ to, ...props }) => <a href={to} {...props} />,
);
export function NavigationProvider({
  link,
  children,
}: {
  link: ComponentType<LinkAdapterProps>;
  children: ReactNode;
}) {
  return <LinkContext.Provider value={link}>{children}</LinkContext.Provider>;
}
export interface ButtonLinkProps extends LinkAdapterProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconPosition?: ButtonIconPosition;
  disabled?: boolean;
}
export function ButtonLink({
  variant = "secondary",
  size = "default",
  icon,
  iconPosition = "left",
  disabled,
  children,
  onClick,
  ...props
}: ButtonLinkProps) {
  const Link = useContext(LinkContext);
  return (
    <PrimitiveButton asChild variant={variants[variant]} size={sizes[size]}>
      <Link
        {...props}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        {icon && iconPosition === "left" ? (
          <span
            className="btn__icon"
            data-icon="inline-start"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        {children}
        {icon && iconPosition === "right" ? (
          <span className="btn__icon" data-icon="inline-end" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </Link>
    </PrimitiveButton>
  );
}
export function IconButtonLink({
  label,
  icon,
  ...props
}: ButtonLinkProps & { label: string; icon: ReactNode }) {
  return (
    <ButtonLink
      {...props}
      size="icon"
      icon={icon}
      aria-label={label}
      title={label}
    />
  );
}
export function ChoiceButton({
  selected,
  className,
  ...props
}: ButtonProps & { selected?: boolean }) {
  return (
    <Button
      {...props}
      className={cn("justify-start", className)}
      variant={selected ? "primary" : "ghost"}
      aria-pressed={selected}
    />
  );
}
