import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useLayoutEffect, useState, } from "react";
import * as Primitive from "./components/ui/tabs.js";
import { ChevronLeft, ChevronRight, Sparkles, Sun, Moon, Monitor, } from "lucide-react";
import { Button, IconButton } from "./actions.js";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuGroup, } from "./components/ui/dropdown-menu.js";
import { useTheme } from "./theme.js";
import { cn } from "./lib/utils.js";
export function Tabs({ items, ariaLabel, tabClassName, children, onValueChange, ...props }) {
    return (_jsxs(Primitive.Tabs, { ...props, onValueChange: (value) => onValueChange?.(value), children: [items ? (_jsx(Primitive.TabsList, { "aria-label": ariaLabel, className: cn("h-auto max-w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0", tabClassName), children: items.map((item, index) => (_jsxs(Primitive.TabsTrigger, { value: item.value, onClick: () => onValueChange?.(item.value), onKeyDown: (event) => {
                        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                            return;
                        }
                        event.preventDefault();
                        const nextIndex = event.key === "ArrowRight"
                            ? (index + 1) % items.length
                            : (index - 1 + items.length) % items.length;
                        const next = items[nextIndex];
                        onValueChange?.(next.value);
                        event.currentTarget.parentElement
                            ?.querySelectorAll('button[role="tab"]')[nextIndex]?.focus();
                    }, className: "subnav-tabs__tab gap-2 rounded-none border-b-2 border-transparent px-3 py-3 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary", children: [item.icon, item.label] }, item.value))) })) : null, children] }));
}
export function TabList({ className, ...props }) {
    return (_jsx(Primitive.TabsList, { ...props, className: cn("h-auto max-w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0", className) }));
}
export function Tab({ className, ...props }) {
    return (_jsx(Primitive.TabsTrigger, { ...props, className: cn("gap-2 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none", className) }));
}
export const TabPanel = Primitive.TabsContent;
export const TabsRoot = Primitive.Tabs;
export const TabsList = TabList;
export const TabsTrigger = Tab;
export const TabsContent = TabPanel;
export const SubnavTabs = Tabs;
export function SectionNav({ label, items, className, }) {
    return (_jsx("nav", { "aria-label": label, className: cn("section-nav", className), children: items.map((item, index) => (_jsx("a", { href: `#${item.id}`, "aria-current": index === 0 ? "location" : undefined, className: "section-nav__link", children: item.label }, item.id))) }));
}
export function ThemeToggle({ label = "主题", labels = { light: "浅色", dark: "深色", system: "跟随系统" }, }) {
    const { mode, setMode } = useTheme();
    const storageKey = "gouno-blog:theme";
    const [fallbackMode, setFallbackMode] = useState(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            return stored === "dark" || stored === "light"
                ? stored
                : label.includes("后台")
                    ? "dark"
                    : "system";
        }
        catch {
            return label.includes("后台") ? "dark" : "system";
        }
    });
    const effectiveMode = mode === "system" ? fallbackMode : mode;
    useLayoutEffect(() => {
        if (mode !== "system")
            return;
        const resolved = fallbackMode === "system" ? "light" : fallbackMode;
        document.documentElement.dataset.theme = resolved;
        try {
            if (label.includes("后台") && !localStorage.getItem(storageKey)) {
                localStorage.setItem(storageKey, resolved);
            }
        }
        catch {
            // Preference storage is optional.
        }
    }, [mode, fallbackMode, label]);
    const Icon = effectiveMode === "system"
        ? Monitor
        : effectiveMode === "dark"
            ? Moon
            : Sun;
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(IconButton, { label: label, icon: _jsx(Icon, {}), "aria-pressed": effectiveMode === "dark", onClick: () => {
                        const nextMode = effectiveMode === "dark" ? "light" : "dark";
                        setFallbackMode(nextMode);
                        setMode(nextMode);
                        try {
                            localStorage.setItem(storageKey, nextMode);
                        }
                        catch {
                            // Preference storage is optional.
                        }
                    } }) }), _jsx(DropdownMenuContent, { align: "end", children: _jsx(DropdownMenuGroup, { children: _jsx(DropdownMenuRadioGroup, { value: effectiveMode, onValueChange: (next) => {
                            const nextMode = next;
                            setFallbackMode(nextMode);
                            setMode(nextMode);
                        }, children: ["light", "dark", "system"].map((value) => (_jsx(DropdownMenuRadioItem, { value: value, children: labels[value] }, value))) }) }) })] }));
}
export function Pagination({ page, pages, onChange, label = "分页导航", className, mode = "numbers", }) {
    if (pages <= 1)
        return null;
    const visible = Array.from(new Set([
        1,
        ...[page - 1, page, page + 1].filter((n) => n > 1 && n < pages),
        pages,
    ]));
    return (_jsxs("nav", { "aria-label": label, className: cn("flex flex-wrap items-center justify-end gap-2 py-3", "pagination", mode === "compact" && "pagination-compact", className), children: [_jsx(IconButton, { label: "\u4E0A\u4E00\u9875", icon: _jsx(ChevronLeft, {}), disabled: page <= 1, onClick: () => onChange(page - 1) }), mode === "compact" ? (_jsxs("span", { "aria-live": "polite", className: "text-sm tabular-nums", children: [page, " / ", pages] })) : (visible.map((n, i) => (_jsxs("span", { className: "flex items-center gap-2", children: [i > 0 && n > visible[i - 1] + 1 ? (_jsx("span", { "aria-hidden": "true", children: "\u2026" })) : null, _jsx(Button, { size: "sm", variant: n === page ? "primary" : "ghost", "aria-current": n === page ? "page" : undefined, onClick: () => onChange(n), children: n })] }, n)))), _jsx(IconButton, { label: "\u4E0B\u4E00\u9875", icon: _jsx(ChevronRight, {}), disabled: page >= pages, onClick: () => onChange(page + 1) })] }));
}
export function BulkActionBar({ selectionLabel, onAIAssist, onCancel, children, aiLabel = "交给 AI", cancelLabel = "取消", className, }) {
    return (_jsxs("div", { role: "toolbar", "aria-label": "\u6279\u91CF\u64CD\u4F5C", className: cn("sticky bottom-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-popover p-3 shadow-lg", className), children: [_jsx("strong", { className: "mr-auto text-sm", children: selectionLabel }), onAIAssist ? (_jsx(Button, { className: "bulk-action-bar__ai", size: "sm", icon: _jsx(Sparkles, {}), onClick: onAIAssist, children: aiLabel })) : null, children, _jsx(Button, { variant: "ghost", size: "sm", onClick: onCancel, children: cancelLabel })] }));
}
