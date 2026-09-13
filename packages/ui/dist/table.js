import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import {} from "react";
import { Table } from "./components/ui/table.js";
import { TableSkeleton } from "./feedback.js";
import { cn } from "./lib/utils.js";
export function DataTable({ children, loading, loadingRows, loadingCols, empty, emptyState, className, density = "default", }) {
    if (loading)
        return (_jsx(TableSkeleton, { rows: loadingRows, columns: loadingCols, label: "Loading table data" }));
    if (empty && emptyState)
        return _jsx(_Fragment, { children: emptyState });
    return (_jsx("div", { "data-slot": "table-container", "data-density": density, className: cn("min-w-0 rounded-lg border", className), children: _jsx(Table, { density: density, children: children }) }));
}
export * from "./components/ui/table.js";
