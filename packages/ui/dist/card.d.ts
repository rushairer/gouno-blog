import { type HTMLAttributes, type ReactNode, type ElementType } from "react";
export declare function Card({ as: Component, variant, padding, interactive, className, ...props }: HTMLAttributes<HTMLElement> & {
    as?: ElementType;
    variant?: "default" | "subtle" | "elevated";
    padding?: "none" | "sm" | "base" | "lg";
    interactive?: boolean;
}): import("react").JSX.Element;
export declare function CardHeader({ title, description, action, children, className, }: {
    title?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    children?: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare const CardTitle: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => import("react").JSX.Element;
export declare const CardDescription: ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => import("react").JSX.Element;
export declare const CardContent: ({ flush: _flush, className, ...props }: HTMLAttributes<HTMLDivElement> & {
    flush?: boolean;
}) => import("react").JSX.Element;
export declare const CardFooter: ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => import("react").JSX.Element;
