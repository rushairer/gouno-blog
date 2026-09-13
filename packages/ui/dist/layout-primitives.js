import { jsx as _jsx } from "react/jsx-runtime";
import * as React from "react";
import { cn } from "./lib/utils.js";
export function Stack({ direction = "column", gap = 4, className, ...p }) { return _jsx("div", { ...p, className: cn("flex", direction === "column" ? "flex-col" : "flex-row", `gap-${gap}`, className) }); }
export function Container({ className, ...p }) { return _jsx("div", { ...p, className: cn("mx-auto w-full max-w-7xl px-4", className) }); }
