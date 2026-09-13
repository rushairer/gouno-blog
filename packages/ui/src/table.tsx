import { type ReactNode } from "react";
import { Table, type TableDensity } from "./components/ui/table";
import { TableSkeleton } from "./feedback";
import { cn } from "./lib/utils";
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
export function DataTable({
  children,
  loading,
  loadingRows,
  loadingCols,
  empty,
  emptyState,
  className,
  density = "default",
}: DataTableProps) {
  if (loading)
    return (
      <TableSkeleton
        rows={loadingRows}
        columns={loadingCols}
        label="Loading table data"
      />
    );
  if (empty && emptyState) return <>{emptyState}</>;
  return (
    <div
      data-slot="table-container"
      data-density={density}
      className={cn("min-w-0 rounded-lg border", className)}
    >
      <Table density={density}>{children}</Table>
    </div>
  );
}
export * from "./components/ui/table";
