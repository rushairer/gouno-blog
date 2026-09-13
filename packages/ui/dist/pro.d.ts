import type { ReactNode } from "react";
import type { TableDensity } from "./components/ui/table.js";
export declare function DashboardTemplate({ title, description, actions, stateControls, children, className, }: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    stateControls?: ReactNode;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function ListPageTemplate({ title, description, action, stateControls, children, }: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    stateControls?: ReactNode;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function EditorWorkspaceTemplate({ outline, canvas, inspector, className, }: {
    outline?: ReactNode;
    canvas: ReactNode;
    inspector: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function ResponsiveList({ table, mobile, density, }: {
    table: ReactNode;
    mobile: ReactNode;
    density?: TableDensity;
}): import("react").JSX.Element;
