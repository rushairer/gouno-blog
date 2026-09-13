"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import * as React from "react";
import { cn } from "../../lib/utils.js";
import { CircleIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
function RadioGroup({ className, ...props }) {
    return (_jsx(RadioGroupPrimitive.Root, { "data-slot": "radio-group", className: cn("grid gap-3", className), ...props }));
}
function RadioGroupItem({ className, ...props }) {
    return (_jsx(RadioGroupPrimitive.Item, { "data-slot": "radio-group-item", className: cn("aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20  ", className), ...props, children: _jsx(RadioGroupPrimitive.Indicator, { "data-slot": "radio-group-indicator", className: "relative flex items-center justify-center", children: _jsx(CircleIcon, { className: "absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" }) }) }));
}
export { RadioGroup, RadioGroupItem };
