import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import {} from "react";
import { X } from "lucide-react";
import { cn } from "./lib/utils.js";
import { IconButton } from "./actions.js";
export function Panel({ as: Component = "section", className, children, ...props }) {
    return (_jsx(Component, { ...props, "data-slot": "panel", className: cn("flex min-w-0 flex-col gap-5 rounded-lg border bg-card p-4 text-card-foreground md:p-6", className), children: children }));
}
export const WorkspacePanel = Panel;
export function PanelHeader({ title, description, actions, action, headingLevel = 2, className, }) {
    const Heading = `h${headingLevel}`;
    return (_jsxs("header", { className: cn("flex flex-col gap-4 md:flex-row md:items-start md:justify-between", className), children: [_jsxs("div", { className: "min-w-0", children: [_jsx(Heading, { className: "text-base font-semibold tracking-tight", children: title }), description ? (_jsx("div", { className: "mt-1 max-w-3xl text-sm text-muted-foreground", children: description })) : null] }), actions || action ? (_jsx(ActionGroup, { children: actions || action })) : null] }));
}
export function PanelBody({ stack, flush: _flush, className, ...props }) {
    return (_jsx("div", { ...props, className: cn("min-w-0", stack && "flex flex-col gap-6", className) }));
}
export function PlainSection({ title, children, className, }) {
    return (_jsxs("section", { className: cn("flex min-w-0 flex-col gap-4 border-t py-5 first:border-0 first:pt-0", className), children: [title ? _jsx("h3", { className: "text-sm font-semibold", children: title }) : null, children] }));
}
export function PageHeader({ title, description, action, actions, className, }) {
    return (_jsxs("header", { className: cn("flex flex-col gap-4 md:flex-row md:items-start md:justify-between", className), children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h1", { className: "text-2xl font-semibold leading-tight tracking-tight", children: title }), description ? (_jsx("div", { className: "mt-2 max-w-3xl text-sm text-muted-foreground", children: description })) : null] }), action || actions ? (_jsx(ActionGroup, { children: action || actions })) : null] }));
}
export const AdminPageHeader = PageHeader;
export function AdminPage({ className, ...props }) {
    return (_jsx("div", { ...props, "data-slot": "admin-page", className: cn("mx-auto flex w-full min-w-0 max-w-[1440px] flex-col gap-6", className) }));
}
export const ContentStack = ({ className, ...props }) => (_jsx("div", { ...props, className: cn("flex min-w-0 flex-col gap-6", className) }));
export const ActionGroup = ({ className, ...props }) => (_jsx("div", { ...props, className: cn("flex flex-wrap items-center gap-2", className) }));
export const FilterBar = ({ className, ...props }) => (_jsx("div", { ...props, className: cn("flex flex-wrap items-end gap-3", className) }));
export const TableContainer = ({ density = "default", className, ...props }) => (_jsx("div", { ...props, "data-slot": "table-container", "data-density": density, className: cn("min-w-0 overflow-x-auto rounded-lg border", className) }));
export function SectionHeading({ title, action, className, }) {
    return _jsx(PanelHeader, { title: title, action: action, className: className });
}
export function EditorPanel({ title, description, icon, closeLabel, onClose, children, className, }) {
    return (_jsxs(Panel, { className: cn("editor-panel", className), children: [_jsx(PanelHeader, { title: _jsxs("span", { className: "flex items-center gap-2", children: [icon, title] }), description: description, action: _jsx(IconButton, { label: closeLabel, icon: _jsx(X, {}), onClick: onClose }) }), children] }));
}
export const DefinitionList = ({ className, ...props }) => (_jsx("dl", { ...props, className: cn("divide-y divide-border", className) }));
export function DefinitionRow({ label, children, mono, className, }) {
    return (_jsxs("div", { className: cn("grid gap-2 py-3 sm:grid-cols-[minmax(140px,1fr)_2fr]", className), children: [_jsx("dt", { className: "text-sm text-muted-foreground", children: label }), _jsx("dd", { className: cn("min-w-0 break-words text-sm", mono && "font-mono"), children: children })] }));
}
export const ListStack = ({ className, ...props }) => (_jsx("div", { ...props, className: cn("divide-y divide-border", className) }));
export function ListRow({ icon, title, meta, action, children, className, }) {
    return (_jsxs("div", { className: cn("flex flex-wrap items-start gap-3 py-4", className), children: [icon ? (_jsx("span", { "aria-hidden": "true", className: "text-muted-foreground", children: icon })) : null, _jsx("div", { className: "min-w-0 flex-1", children: children || (_jsxs(_Fragment, { children: [_jsx("div", { className: "break-words font-medium", children: title }), _jsx("div", { className: "text-sm text-muted-foreground", children: meta })] })) }), action ? _jsx(ActionGroup, { children: action }) : null] }));
}
export function ButtonGroup({ align, compact: _compact, className, ...props }) {
    return (_jsx(ActionGroup, { ...props, className: cn(align === "right" && "justify-end", className) }));
}
