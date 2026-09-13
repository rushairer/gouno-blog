import { type ReactNode } from "react";
import { type TableDensity } from "./components/ui/table.js";
export interface DataTableProps {
    children?: ReactNode;
    loading?: boolean;
    loadingRows?: number;
    loadingCols?: number;
    empty?: boolean;
    emptyState?: ReactNode;
    className?: string;
    density?: TableDensity;
}
export declare function DataTable({ children, loading, loadingRows, loadingCols, empty, emptyState, className, density, }: DataTableProps): import("react").JSX.Element;
export * from "./components/ui/table.js";
