import { cloneElement, forwardRef, isValidElement, useId } from "react";
import type React from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "../../lib/utils";

export function FormActions({
  children,
  className = "",
  surface = false,
}: React.HTMLAttributes<HTMLDivElement> & { surface?: boolean }) {
  return (
    <div
      className={cn(
        "form-actions flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border/50",
        surface && "form-actions--surface bg-card/40 p-4 rounded-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormLayout({
  className = "",
  ...props
}: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn("form-layout space-y-4", className)} {...props} />;
}

export function OverlayForm({
  children,
  actions,
  className = "",
  actionClassName = "",
  ...props
}: React.FormHTMLAttributes<HTMLFormElement> & {
  actions: React.ReactNode;
  actionClassName?: string;
}) {
  return (
    <FormLayout className={cn("drawer-form space-y-4", className)} {...props}>
      {children}
      <FormActions className={cn("mt-6", actionClassName)}>
        {actions}
      </FormActions>
    </FormLayout>
  );
}

export function FormGrid({
  children,
  columns = 2,
  className = "",
}: React.HTMLAttributes<HTMLDivElement> & { columns?: 1 | 2 | 3 | 4 | 5 }) {
  const colClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 md:grid-cols-3"
        : columns === 4
          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
          : columns === 5
            ? "grid-cols-1 md:grid-cols-3 lg:grid-cols-5"
            : "grid-cols-1 md:grid-cols-2";

  return (
    <div className={cn("grid gap-4", colClass, className)}>{children}</div>
  );
}

export type ControlSize = "regular" | "compact";
export type ControlProps = { size?: ControlSize; invalid?: boolean };
export type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> &
  ControlProps;
export type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> &
  ControlProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", size = "regular", invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex w-full rounded-[var(--radius-control,6px)] border border-border bg-input px-3 py-1.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
        size === "compact" ? "ui-control--compact h-8 text-xs px-2.5" : "h-9",
        invalid && "border-destructive focus-visible:ring-destructive/30",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps
>(function Textarea(
  { className = "", size = "regular", invalid, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "flex min-h-[80px] w-full rounded-[var(--radius-control,6px)] border border-border bg-input px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
        size === "compact" ? "ui-control--compact text-xs p-2" : "",
        invalid && "border-destructive focus-visible:ring-destructive/30",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { className = "", size = "regular", invalid, children, ...props },
    ref,
  ) {
    return (
      <div className="select-control relative flex items-center w-full">
        <select
          ref={ref}
          className={cn(
            "flex w-full appearance-none rounded-[var(--radius-control,6px)] border border-border bg-input px-3 py-1.5 pr-8 text-sm text-foreground shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
            size === "compact"
              ? "ui-control--compact h-8 text-xs px-2.5"
              : "h-9",
            invalid && "border-destructive focus-visible:ring-destructive/30",
            className,
          )}
          aria-invalid={invalid || undefined}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  },
);

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(function Checkbox({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-4 w-4 rounded-[4px] border border-border bg-input text-primary accent-primary focus:ring-2 focus:ring-ring focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      type="checkbox"
      {...props}
    />
  );
});

export const Radio = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(function Radio({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-4 w-4 rounded-full border border-border bg-input text-primary accent-primary focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      type="radio"
      {...props}
    />
  );
});

export const Switch = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
    label?: React.ReactNode;
  }
>(function Switch({ className = "", label, id, ...props }, ref) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        className="sr-only peer"
        type="checkbox"
        role="switch"
        {...props}
      />
      <div className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-zinc-700 transition-colors duration-200 ease-in-out peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
        <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out translate-x-0 peer-checked:translate-x-4" />
      </div>
      {label ? (
        <span className="text-sm font-medium text-foreground">{label}</span>
      ) : null}
    </label>
  );
});

export function CheckboxField({
  children,
  className = "",
  ...props
}: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, "children"> & {
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-sm text-foreground cursor-pointer select-none",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  children,
  className = "",
  id,
  hint,
  error,
  required = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
}) {
  const generatedID = useId();
  const controlID = id || `field-${generatedID.replaceAll(":", "")}`;
  const descriptionID = hint || error ? `${controlID}-description` : undefined;
  const control = isValidElement<{
    id?: string;
    className?: string;
    required?: boolean;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>(children)
    ? cloneElement(children, {
        id: children.props.id || controlID,
        required: children.props.required ?? required,
        "aria-describedby": children.props["aria-describedby"] || descriptionID,
        "aria-invalid":
          children.props["aria-invalid"] || Boolean(error) || undefined,
      })
    : children;

  return (
    <div className={cn("field space-y-1.5", className)}>
      <label
        className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider"
        htmlFor={controlID}
      >
        <span>{label}</span>
        {required ? (
          <span className="text-destructive ml-1" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {control}
      {error ? (
        <p className="text-xs text-destructive font-medium" id={descriptionID}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground" id={descriptionID}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SearchField({
  className = "",
  size = "compact",
  ...props
}: InputProps) {
  return (
    <div className={cn("relative flex items-center w-full", className)}>
      <Search
        className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input type="search" size={size} className="pl-9" {...props} />
    </div>
  );
}
