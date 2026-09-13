import { type ReactNode } from "react";
export interface AdminShellProps {
    brand: ReactNode;
    navigation: (close: () => void) => ReactNode;
    toolbar?: ReactNode;
    breadcrumbs?: ReactNode;
    account?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    navigationLabel?: string;
}
/** Router and permissions are supplied by each application; this template owns only presentation. */
export declare function AdminShell({ brand, navigation, toolbar, breadcrumbs, account, footer, children, navigationLabel, }: AdminShellProps): import("react").JSX.Element;
export declare function NavigationGroup({ label, children, }: {
    label: string;
    children: ReactNode;
}): import("react").JSX.Element;
export declare const navigationItemClass = "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&.active]:bg-accent [&.active]:font-medium [&.active]:text-accent-foreground";
