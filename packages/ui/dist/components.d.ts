import * as React from "react";
export declare function Spinner({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element;
export declare function Progress({ value, max, className, ...p }: React.HTMLAttributes<HTMLDivElement> & {
    value?: number;
    max?: number;
}): React.JSX.Element;
export declare function AspectRatio({ ratio, className, children, ...p }: React.HTMLAttributes<HTMLDivElement> & {
    ratio?: number;
}): React.JSX.Element;
export declare function Kbd({ className, ...p }: React.HTMLAttributes<HTMLElement>): React.JSX.Element;
export declare function Tag({ className, children, ...p }: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element;
export declare function Typography({ as: Comp, className, ...p }: React.HTMLAttributes<HTMLElement> & {
    as?: React.ElementType;
}): React.ReactElement<any, string | React.JSXElementConstructor<any>>;
export declare function Stack({ direction, gap, className, ...p }: React.HTMLAttributes<HTMLDivElement> & {
    direction?: "row" | "column";
    gap?: number;
}): React.JSX.Element;
export declare function Container({ className, ...p }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element;
export declare function Pagination({ page, pages, onPageChange, className }: {
    page: number;
    pages: number;
    onPageChange: (p: number) => void;
    className?: string;
}): React.JSX.Element;
export declare function Statistic({ title, value, prefix, suffix, className }: {
    title: React.ReactNode;
    value: React.ReactNode;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
    className?: string;
}): React.JSX.Element;
export declare function Timeline({ items, className }: {
    items: {
        title: React.ReactNode;
        description?: React.ReactNode;
    }[];
    className?: string;
}): React.JSX.Element;
