import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { Menu } from "lucide-react";
import { IconButton } from "./actions.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle, } from "./components/ui/sheet.js";
/** Router and permissions are supplied by each application; this template owns only presentation. */
export function AdminShell({ brand, navigation, toolbar, breadcrumbs, account, footer, children, navigationLabel = "后台导航", }) {
    const [open, setOpen] = useState(false);
    const navigationTrigger = useRef(null);
    return (_jsxs("div", { className: "min-h-dvh bg-background text-foreground", children: [_jsx("a", { href: "#workspace-main", className: "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-popover focus:p-3", children: "\u8DF3\u81F3\u4E3B\u8981\u5185\u5BB9" }), _jsxs("header", { className: "sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-3 lg:w-[216px]", children: [_jsx(IconButton, { ref: navigationTrigger, className: "lg:hidden", label: navigationLabel, icon: _jsx(Menu, {}), onClick: () => setOpen(true) }), _jsx("div", { className: "min-w-0 truncate text-base font-semibold tracking-tight text-primary", children: brand })] }), _jsx("div", { className: "hidden min-w-0 flex-1 text-sm text-muted-foreground md:block", children: breadcrumbs }), _jsxs("div", { className: "ml-auto flex items-center gap-2", children: [toolbar, account] })] }), _jsxs("div", { className: "grid min-h-[calc(100dvh-64px)] lg:grid-cols-[240px_minmax(0,1fr)]", children: [_jsxs("aside", { className: "sticky top-16 hidden h-[calc(100dvh-64px)] flex-col border-r bg-sidebar px-3 py-5 lg:flex", children: [_jsx("nav", { "aria-label": navigationLabel, className: "min-h-0 flex-1 overflow-y-auto", children: navigation(() => { }) }), footer ? _jsx("div", { className: "mt-4 border-t pt-4", children: footer }) : null] }), _jsx("main", { id: "workspace-main", tabIndex: -1, className: "min-w-0 px-4 py-6 outline-none md:px-6 xl:px-8", children: children })] }), _jsx(Sheet, { open: open, onOpenChange: setOpen, children: _jsxs(SheetContent, { side: "left", className: "flex w-[280px] flex-col bg-sidebar", "aria-describedby": undefined, onCloseAutoFocus: (event) => {
                        event.preventDefault();
                        navigationTrigger.current?.focus();
                    }, children: [_jsx(SheetHeader, { children: _jsx(SheetTitle, { children: brand }) }), _jsx("nav", { "aria-label": navigationLabel, className: "flex-1 overflow-auto px-3", children: navigation(() => setOpen(false)) }), footer ? _jsx("div", { className: "p-4", children: footer }) : null] }) })] }));
}
export function NavigationGroup({ label, children, }) {
    return (_jsxs("section", { className: "mb-6 flex flex-col gap-1", children: [_jsx("h2", { className: "px-3 pb-2 text-xs font-medium text-muted-foreground", children: label }), children] }));
}
export const navigationItemClass = "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&.active]:bg-accent [&.active]:font-medium [&.active]:text-accent-foreground";
