import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useContext, } from "react";
import { LoaderCircle } from "lucide-react";
import { Button as PrimitiveButton } from "./components/ui/button.js";
import { cn } from "./lib/utils.js";
const variants = {
    primary: "default",
    default: "default",
    secondary: "outline",
    outline: "outline",
    danger: "destructive",
    destructive: "destructive",
    ghost: "ghost",
    link: "link",
};
const sizes = {
    sm: "sm",
    compact: "sm",
    default: "default",
    regular: "default",
    base: "default",
    lg: "lg",
    icon: "icon",
};
export function Button({ variant = "secondary", size = "default", loading = false, icon, iconPosition = "left", children, disabled, type = "button", ...props }) {
    return (_jsxs(PrimitiveButton, { ...props, className: cn("btn", `btn-${variant}`, (size === "sm" || size === "compact") && "btn--compact", size === "icon" && "btn--compact", loading && "is-loading", size === "sm" || size === "compact" ? "btn-sm" : undefined, props.className), type: type, variant: variants[variant], size: sizes[size], disabled: disabled || loading, "aria-busy": loading || undefined, children: [loading ? (_jsx(LoaderCircle, { "data-icon": "inline-start", className: "animate-spin" })) : icon && iconPosition === "left" ? (_jsx("span", { className: "btn__icon", "data-icon": "inline-start", "aria-hidden": "true", children: icon })) : null, _jsx("span", { className: "btn__label", children: children }), !loading && icon && iconPosition === "right" ? (_jsx("span", { className: "btn__icon", "data-icon": "inline-end", "aria-hidden": "true", children: icon })) : null] }));
}
export function IconButton({ label, icon, size: _size, variant = "ghost", ...props }) {
    return (_jsx(Button, { ...props, className: cn("icon-button", `icon-button--${variant}`, props.className), variant: variant, size: "icon", "aria-label": label, "aria-pressed": props["aria-pressed"], title: label, children: _jsx("span", { className: "icon-button__icon", children: icon }) }));
}
const LinkContext = createContext(({ to, ...props }) => _jsx("a", { href: to, ...props }));
export function NavigationProvider({ link, children, }) {
    return _jsx(LinkContext.Provider, { value: link, children: children });
}
export function ButtonLink({ variant = "secondary", size = "default", icon, iconPosition = "left", disabled, children, onClick, className, ...props }) {
    const Link = useContext(LinkContext);
    return (_jsx(PrimitiveButton, { asChild: true, variant: variants[variant], size: sizes[size], children: _jsxs(Link, { ...props, className: cn("btn", `btn-${variant}`, "btn--compact", className), "aria-disabled": disabled || undefined, tabIndex: disabled ? -1 : undefined, onClick: (event) => {
                if (disabled) {
                    event.preventDefault();
                    return;
                }
                onClick?.(event);
            }, children: [icon && iconPosition === "left" ? (_jsx("span", { className: "btn__icon", "data-icon": "inline-start", "aria-hidden": "true", children: icon })) : null, _jsx("span", { className: "btn__label", children: children }), icon && iconPosition === "right" ? (_jsx("span", { className: "btn__icon", "data-icon": "inline-end", "aria-hidden": "true", children: icon })) : null] }) }));
}
export function IconButtonLink({ label, icon, className, variant = "secondary", ...props }) {
    return (_jsx(ButtonLink, { ...props, size: "icon", icon: icon, variant: variant, className: cn("icon-button", `icon-button--${variant}`, className), "aria-label": label, title: label }));
}
export function ChoiceButton({ selected, className, ...props }) {
    return (_jsx(Button, { ...props, className: cn("justify-start", className), variant: selected ? "primary" : "ghost", "aria-pressed": selected }));
}
