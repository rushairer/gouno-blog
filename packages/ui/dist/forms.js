import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cloneElement, isValidElement, useId, } from "react";
import { Search, ChevronDown } from "lucide-react";
import { Input as PrimitiveInput } from "./components/ui/input.js";
import { Textarea as PrimitiveTextarea } from "./components/ui/textarea.js";
import { Field as FieldRoot, FieldLabel, FieldDescription, FieldError, FieldGroup, FieldSet, FieldLegend, } from "./components/ui/field.js";
import { cn } from "./lib/utils.js";
export { FieldGroup, FieldSet, FieldLegend, FieldLabel };
export function Input({ size = "regular", invalid, isError, prefixIcon, suffixIcon, className, ...props }) {
    const control = (_jsx(PrimitiveInput, { ...props, "aria-invalid": invalid || isError || props["aria-invalid"], className: cn("bg-input text-foreground placeholder:text-muted-foreground", size === "compact" && "h-8 ui-control--compact", prefixIcon && "pl-10", suffixIcon && "pr-11", className) }));
    return prefixIcon || suffixIcon ? (_jsxs("div", { "data-slot": "input-group", className: "relative min-w-0", children: [prefixIcon ? (_jsx("span", { "data-slot": "input-group-addon", "aria-hidden": "true", className: "pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground [&_svg]:size-4", children: prefixIcon })) : null, control, suffixIcon ? (_jsx("span", { "data-slot": "input-group-addon", className: "absolute right-1 top-1/2 -translate-y-1/2", children: suffixIcon })) : null] })) : (control);
}
export function Textarea({ invalid, isError, size: _size, ...props }) {
    return (_jsx(PrimitiveTextarea, { ...props, "aria-invalid": invalid || isError || props["aria-invalid"] }));
}
/** Native select preserves form serialization and the apps' existing change-event contract. */
export function Select({ size, invalid, isError, className, children, ...props }) {
    return (_jsxs("div", { className: "select-control relative min-w-0", children: [_jsx("select", { ...props, "data-slot": "select-trigger", size: typeof size === "number" ? size : undefined, "aria-invalid": invalid || isError || props["aria-invalid"], className: cn("h-9 w-full appearance-none rounded-md border border-border bg-input px-3 pr-9 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", size === "compact" && "h-8 ui-control--compact", className), children: children }), _jsx(ChevronDown, { "aria-hidden": "true", className: "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" })] }));
}
export function Field({ label, children, id, hint, error, required = false, className, noMargin: _noMargin, hideLabel = false, }) {
    const generated = useId();
    const child = isValidElement(children)
        ? children
        : null;
    const controlId = id || child?.props.id || `field-${generated}`;
    const descriptionId = hint || error ? `${controlId}-description` : undefined;
    return (_jsxs(FieldRoot, { "data-invalid": error ? true : undefined, className: cn("field min-w-0", className), children: [_jsxs(FieldLabel, { htmlFor: controlId, className: hideLabel ? "sr-only" : undefined, children: [label, required ? (_jsx("span", { "aria-hidden": "true", className: "text-destructive", children: "*" })) : null] }), child
                ? cloneElement(child, {
                    id: controlId,
                    required: child.props.required ?? required,
                    "aria-describedby": [child.props["aria-describedby"], descriptionId]
                        .filter(Boolean)
                        .join(" ") || undefined,
                    "aria-invalid": child.props["aria-invalid"] || Boolean(error) || undefined,
                })
                : children, error ? (_jsx(FieldError, { id: descriptionId, role: "alert", children: error })) : hint ? (_jsx(FieldDescription, { id: descriptionId, children: hint })) : null] }));
}
export const FormField = Field;
function CheckControl({ label, id, kind, className, ...props }) {
    const generated = useId();
    const controlId = id || generated;
    const control = (_jsx("input", { ...props, id: controlId, type: kind, className: cn("size-4 shrink-0 accent-primary disabled:opacity-50", className) }));
    return label ? (_jsxs("label", { htmlFor: controlId, className: "flex items-center gap-2 text-sm", children: [control, _jsx("span", { children: label })] })) : (control);
}
export const Checkbox = (props) => (_jsx(CheckControl, { ...props, kind: "checkbox" }));
export const Radio = (props) => (_jsx(CheckControl, { ...props, kind: "radio" }));
export function Switch({ label, id, className, ...props }) {
    const generated = useId();
    return (_jsxs("label", { className: cn("flex items-center gap-3", className), htmlFor: id || generated, children: [_jsx("input", { ...props, id: id || generated, type: "checkbox", role: "switch", className: "peer sr-only" }), _jsx("span", { className: "flex h-6 w-10 shrink-0 items-center rounded-full border border-border bg-secondary p-0.5 peer-checked:justify-end peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50", children: _jsx("span", { className: "size-4 rounded-full bg-background" }) }), label ? _jsx("span", { children: label }) : null] }));
}
export function CheckboxField({ children, className, ...props }) {
    return (_jsx("label", { ...props, className: cn("flex items-center gap-2", className), children: children }));
}
export function CheckboxGroup({ label, children, }) {
    return (_jsxs(FieldSet, { children: [_jsx(FieldLegend, { children: label }), _jsx(FieldGroup, { className: "flex-row flex-wrap gap-4", children: children })] }));
}
export function FormLayout({ className, ...props }) {
    return (_jsx("form", { ...props, className: cn("form-layout flex min-w-0 flex-col gap-6", className) }));
}
export function FormGrid({ columns = 2, className, ...props }) {
    return (_jsx(FieldGroup, { ...props, className: cn("grid gap-5", {
            1: "grid-cols-1",
            2: "md:grid-cols-2",
            3: "md:grid-cols-3",
            4: "md:grid-cols-2 xl:grid-cols-4",
            5: "md:grid-cols-3 xl:grid-cols-5",
        }[columns], className) }));
}
export function FormActions({ surface, className, ...props }) {
    return (_jsx("div", { ...props, className: cn("flex flex-wrap items-center justify-end gap-3 border-t pt-5", surface && "form-actions--surface", className) }));
}
export function OverlayForm({ actions, actionClassName, ...props }) {
    return (_jsxs(FormLayout, { ...props, children: [props.children, _jsx(FormActions, { className: actionClassName, children: actions })] }));
}
export function SearchField({ className, ...props }) {
    return (_jsxs("div", { className: cn("relative min-w-0", className), children: [_jsx(Search, { "aria-hidden": "true", className: "pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" }), _jsx(Input, { ...props, type: props.type || "search", className: "pl-9" })] }));
}
