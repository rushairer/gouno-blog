import * as React from "react";
export declare function Stack({ direction, gap, className, ...p }: React.HTMLAttributes<HTMLDivElement> & {
    direction?: "row" | "column";
    gap?: number;
}): React.JSX.Element;
export declare function Container({ className, ...p }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element;
