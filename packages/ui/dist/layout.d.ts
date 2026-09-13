import { type ReactNode, type ElementType, type HTMLAttributes } from "react";
import type { TableDensity } from "./components/ui/table.js";
export declare function Panel({ as: Component, className, children, ...props }: HTMLAttributes<HTMLElement> & {
    as?: ElementType;
    children: ReactNode;
    type?: "button" | "submit" | "reset";
}): import("react").JSX.Element;
export declare const WorkspacePanel: typeof Panel;
export declare function PanelHeader({ title, description, actions, action, headingLevel, className, }: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    action?: ReactNode;
    headingLevel?: 2 | 3;
    className?: string;
}): import("react").JSX.Element;
export declare function PanelBody({ stack, flush: _flush, className, ...props }: HTMLAttributes<HTMLDivElement> & {
    stack?: boolean;
    flush?: boolean;
}): import("react").JSX.Element;
export declare function PlainSection({ title, children, className, }: {
    title?: ReactNode;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function PageHeader({ title, description, action, actions, className, }: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    actions?: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare const AdminPageHeader: typeof PageHeader;
export declare function AdminPage({ className, ...props }: HTMLAttributes<HTMLDivElement>): import("react").JSX.Element;
export declare const ContentStack: ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => import("react").JSX.Element;
export declare const ActionGroup: ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => import("react").JSX.Element;
export declare const FilterBar: ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => import("react").JSX.Element;
export declare const TableContainer: ({ density, className, ...props }: HTMLAttributes<HTMLDivElement> & {
    density?: TableDensity;
}) => import("react").JSX.Element;
export declare function SectionHeading({ title, action, className, }: {
    title: ReactNode;
    action?: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function EditorPanel({ title, description, icon, closeLabel, onClose, children, className, }: {
    title: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    closeLabel: string;
    onClose: () => void;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare const DefinitionList: ({ className, ...props }: HTMLAttributes<HTMLDListElement>) => import("react").JSX.Element;
export declare function DefinitionRow({ label, children, mono, className, }: {
    label: ReactNode;
    children: ReactNode;
    mono?: boolean;
    className?: string;
}): import("react").JSX.Element;
export declare const ListStack: ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => import("react").JSX.Element;
export declare function ListRow({ icon, title, meta, action, children, className, }: {
    icon?: ReactNode;
    title?: ReactNode;
    meta?: ReactNode;
    action?: ReactNode;
    children?: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function ButtonGroup({ align, compact: _compact, className, ...props }: HTMLAttributes<HTMLDivElement> & {
    align?: string;
    compact?: boolean;
}): import("react").JSX.Element;
