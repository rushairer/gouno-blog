import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from "react";
import { cn } from "./lib/utils.js";
export function Statistic({ title, value, prefix, suffix, className }) { return _jsxs("div", { className: cn("space-y-1", className), children: [_jsx("div", { className: "text-sm text-muted-foreground", children: title }), _jsxs("div", { className: "text-2xl font-semibold", children: [prefix, value, suffix] })] }); }
export function Timeline({ items, className }) { return _jsx("ol", { className: cn("space-y-4 border-l pl-4", className), children: items.map((x, i) => _jsxs("li", { className: "relative", children: [_jsx("span", { className: "absolute -left-[21px] top-1 size-2 rounded-full bg-primary" }), _jsx("div", { className: "font-medium", children: x.title }), x.description && _jsx("div", { className: "text-sm text-muted-foreground", children: x.description })] }, i)) }); }
