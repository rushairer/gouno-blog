import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "./lib/utils.js";
import { PageHeader, Panel } from "./layout.js";
export function DashboardTemplate({ title, description, actions, stateControls, children, className, }) {
    return (_jsxs("div", { className: cn("flex min-w-0 flex-col gap-6", className), children: [_jsx(PageHeader, { title: title, description: description, actions: actions }), stateControls, children] }));
}
export function ListPageTemplate({ title, description, action, stateControls, children, }) {
    return (_jsxs("div", { className: "flex min-w-0 flex-col gap-6", children: [_jsx(PageHeader, { title: title, description: description, action: action }), stateControls, children] }));
}
export function EditorWorkspaceTemplate({ outline, canvas, inspector, className, }) {
    return (_jsxs("div", { "data-slot": "editor-workspace", className: cn("grid min-w-0 gap-6 xl:grid-cols-[200px_minmax(0,1fr)_320px]", className), children: [outline ? (_jsx("aside", { "data-slot": "editor-outline", className: "hidden min-w-0 xl:block", children: _jsx(Panel, { className: "h-full", children: outline }) })) : null, _jsx("section", { "data-slot": "editor-canvas", className: "min-w-0", children: canvas }), _jsx("aside", { "data-slot": "editor-inspector", className: "min-w-0", children: inspector })] }));
}
export function ResponsiveList({ table, mobile, density = "default", }) {
    return (_jsxs("div", { "data-slot": "responsive-list", "data-density": density, className: "min-w-0", children: [_jsx("div", { className: "hidden md:block", children: table }), _jsx("div", { className: "grid gap-3 md:hidden", children: mobile })] }));
}
