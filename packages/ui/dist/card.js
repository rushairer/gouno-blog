import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import {} from "react";
import { cn } from "./lib/utils.js";
export function Card({ as: Component = "section", variant = "default", padding = "base", interactive, className, ...props }) {
    return (_jsx(Component, { ...props, tabIndex: interactive ? (props.tabIndex ?? 0) : props.tabIndex, "data-slot": "card", className: cn("ui-card min-w-0 rounded-lg border bg-card text-card-foreground", padding === "sm"
            ? "p-4"
            : padding === "lg"
                ? "p-8"
                : padding === "none"
                    ? "p-0"
                    : "p-6", variant === "subtle" && "bg-muted", variant === "elevated" && "shadow-lg ui-card--elevated", padding === "lg" && "ui-card--padding-lg", interactive &&
            "cursor-pointer hover:border-primary ui-card--interactive", className) }));
}
export function CardHeader({ title, description, action, children, className, }) {
    return (_jsx("header", { "data-slot": "card-header", className: cn("flex items-start justify-between gap-4", className), children: children || (_jsxs(_Fragment, { children: [_jsxs("div", { children: [title ? _jsx(CardTitle, { children: title }) : null, description ? (_jsx(CardDescription, { children: description })) : null] }), action] })) }));
}
export const CardTitle = ({ className, ...props }) => (_jsx("h3", { ...props, "data-slot": "card-title", className: cn("text-base font-semibold", className) }));
export const CardDescription = ({ className, ...props }) => (_jsx("p", { ...props, className: cn("mt-1 text-sm text-muted-foreground", className) }));
export const CardContent = ({ flush: _flush, className, ...props }) => (_jsx("div", { ...props, className: cn("min-w-0", className) }));
export const CardFooter = ({ className, ...props }) => (_jsx("footer", { ...props, className: cn("flex flex-wrap items-center gap-3", className) }));
