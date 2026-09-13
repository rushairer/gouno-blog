import type { HTMLAttributes, ReactNode } from "react";
export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
export declare function Badge({ tone, pill: _pill, variant: _variant, className, ...props }: HTMLAttributes<HTMLSpanElement> & {
    tone?: BadgeTone;
    pill?: boolean;
    variant?: string;
}): import("react").JSX.Element;
export declare function StatusIndicator({ status, label, className, }: {
    status: string;
    label: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function RiskBadge({ level, label, className, }: {
    level: string;
    label: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare const Tag: typeof Badge;
export declare function StatusBadge({ status, children, label, tone, compact, className, }: {
    status?: string;
    children?: ReactNode;
    label?: ReactNode;
    tone?: BadgeTone;
    compact?: boolean;
    className?: string;
}): import("react").JSX.Element;
