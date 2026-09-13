import { type ReactNode, type ComponentProps } from "react";
import * as Primitive from "./components/ui/tabs.js";
import { type ThemeMode } from "./theme.js";
export interface TabItem<T extends string = string> {
    value: T;
    label: ReactNode;
    icon?: ReactNode;
}
export declare function Tabs<T extends string = string>({ items, ariaLabel, tabClassName, children, onValueChange, ...props }: Omit<ComponentProps<typeof Primitive.Tabs>, "onValueChange"> & {
    items?: readonly TabItem<T>[];
    ariaLabel?: string;
    tabClassName?: string;
    onValueChange?: (value: T) => void;
}): import("react").JSX.Element;
export declare function TabList({ className, ...props }: ComponentProps<typeof Primitive.TabsList>): import("react").JSX.Element;
export declare function Tab({ className, ...props }: ComponentProps<typeof Primitive.TabsTrigger>): import("react").JSX.Element;
export declare const TabPanel: typeof Primitive.TabsContent;
export declare const TabsRoot: typeof Primitive.Tabs;
export declare const TabsList: typeof TabList;
export declare const TabsTrigger: typeof Tab;
export declare const TabsContent: typeof Primitive.TabsContent;
export declare const SubnavTabs: typeof Tabs;
export declare function SectionNav({ label, items, className, }: {
    label: string;
    items: readonly {
        id: string;
        label: ReactNode;
    }[];
    className?: string;
}): import("react").JSX.Element;
export declare function ThemeToggle({ label, labels, }: {
    label?: string;
    labels?: Record<ThemeMode, string>;
}): import("react").JSX.Element;
export declare function Pagination({ page, pages, onChange, label, className, mode, }: {
    page: number;
    pages: number;
    onChange: (page: number) => void;
    label?: string;
    className?: string;
    mode?: "numbers" | "compact";
}): import("react").JSX.Element | null;
export declare function BulkActionBar({ selectionLabel, onAIAssist, onCancel, children, aiLabel, cancelLabel, className, }: {
    selectionLabel: ReactNode;
    onAIAssist?: () => void;
    onCancel: () => void;
    children?: ReactNode;
    aiLabel?: string;
    cancelLabel?: string;
    className?: string;
}): import("react").JSX.Element;
