import * as React from "react";
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
