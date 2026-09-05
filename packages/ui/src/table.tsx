import { type ReactNode } from 'react';
import { Table } from './components/ui/table';
import { TableSkeleton } from './feedback';
import {cn} from './lib/utils';
export interface DataTableProps {children?:ReactNode;loading?:boolean;loadingRows?:number;loadingCols?:number;empty?:boolean;emptyState?:ReactNode;className?:string}
export function DataTable({children,loading,loadingRows,loadingCols,empty,emptyState,className}:DataTableProps){if(loading)return <TableSkeleton rows={loadingRows} columns={loadingCols}/>;if(empty&&emptyState)return <>{emptyState}</>;return <div className={cn('min-w-0 rounded-lg border',className)}><Table>{children}</Table></div>;}
export * from './components/ui/table';
