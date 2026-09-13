import { jsx as _jsx } from "react/jsx-runtime";
import * as React from "react";
import { cn } from "./lib/utils.js";
export function Spinner({ className, ...p }) { return _jsx("span", { role: "status", "aria-label": "Loading", ...p, className: cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className) }); }
export function Progress({ value = 0, max = 100, className, ...p }) { const pct = Math.min(100, Math.max(0, (value / max) * 100)); return _jsx("div", { role: "progressbar", "aria-valuenow": value, "aria-valuemin": 0, "aria-valuemax": max, ...p, className: cn("h-2 w-full overflow-hidden rounded-full bg-muted", className), children: _jsx("div", { className: "h-full bg-primary transition-all", style: { width: `${pct}%` } }) }); }
export function AspectRatio({ ratio = 16 / 9, className, children, ...p }) { return _jsx("div", { ...p, className: cn("relative w-full", className), style: { aspectRatio: ratio }, children: children }); }
export function Kbd({ className, ...p }) { return _jsx("kbd", { ...p, className: cn("rounded border bg-muted px-1.5 py-0.5 font-mono text-xs", className) }); }
export function Typography({ as: Comp = "p", className, ...p }) { return React.createElement(Comp, { ...p, className: cn("text-sm text-foreground", className) }); }
