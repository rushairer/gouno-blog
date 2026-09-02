import { cloneElement, forwardRef, isValidElement, useId } from "react";
import type React from "react";
import { ChevronDown, Search } from "lucide-react";
import { classes } from "./classes";

export function FormActions({
  children,
  className = "",
  surface = false,
}: React.HTMLAttributes<HTMLDivElement> & { surface?: boolean }) {
  return (
    <div
      className={classes(
        "form-actions",
        surface && "form-actions--surface",
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
  return <form className={classes("form-layout", className)} {...props} />;
}

export function OverlayForm({
  children,
  actions,
  className = "",
  actionClassName = "drawer-actions",
  ...props
}: React.FormHTMLAttributes<HTMLFormElement> & {
  actions: React.ReactNode;
  actionClassName?: string;
}) {
  return (
    <FormLayout className={classes("drawer-form", className)} {...props}>
      {children}
      <FormActions className={actionClassName}>{actions}</FormActions>
    </FormLayout>
  );
}

export function FormGrid({
  children,
  columns = 2,
  className = "",
}: React.HTMLAttributes<HTMLDivElement> & { columns?: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div
      className={classes("form-grid", className)}
      style={{ "--form-columns": columns } as React.CSSProperties}
    >
      {children}
    </div>
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
      className={classes(
        "ui-control",
        size === "compact" && "ui-control--compact",
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
  { className = "", size = "regular", invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={classes(
        "ui-control",
        size === "compact" && "ui-control--compact",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { className = "", size = "regular", invalid, ...props },
    ref,
  ) {
    return (
      <span className="select-control">
        <select
          ref={ref}
          className={classes(
            "ui-control",
            size === "compact" && "ui-control--compact",
            className,
          )}
          aria-invalid={invalid || undefined}
          {...props}
        />
        <ChevronDown aria-hidden="true" />
      </span>
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
      className={classes("ui-checkbox", className)}
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
      className={classes("ui-radio", className)}
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
    <label className={classes("ui-switch-label", className)}>
      <input
        ref={ref}
        id={id}
        className="ui-switch"
        type="checkbox"
        role="switch"
        {...props}
      />
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__thumb" />
      </span>
      {label ? <span className="ui-switch__text">{label}</span> : null}
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
    <label className={classes("checkbox-field", className)} {...props}>
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
        className: classes("input-field", children.props.className),
        required: children.props.required ?? required,
        "aria-describedby": children.props["aria-describedby"] || descriptionID,
        "aria-invalid":
          children.props["aria-invalid"] || Boolean(error) || undefined,
      })
    : children;
  return (
    <div
      className={classes(
        "field",
        Boolean(error) && "field--invalid",
        className,
      )}
    >
      <label className="field__label" htmlFor={controlID}>
        <span>{label}</span>
        {required ? (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {control}
      {error ? (
        <span className="field__error" id={descriptionID}>
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint" id={descriptionID}>
          {hint}
        </span>
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
    <div
      className={classes(
        "search-field",
        size === "regular" && "search-field--regular",
        className,
      )}
    >
      <Search aria-hidden="true" />
      <Input type="search" size={size} {...props} />
    </div>
  );
}
