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
export declare function Typography({ as: Comp, className, ...p }: React.HTMLAttributes<HTMLElement> & {
    as?: React.ElementType;
}): React.ReactElement<any, string | React.JSXElementConstructor<any>>;
