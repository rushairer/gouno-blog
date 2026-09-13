import { type VariantProps } from "class-variance-authority";
import { Label } from "./label.js";
declare function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">): import("react").JSX.Element;
declare function FieldLegend({ className, variant, ...props }: React.ComponentProps<"legend"> & {
    variant?: "legend" | "label";
}): import("react").JSX.Element;
declare function FieldGroup({ className, ...props }: React.ComponentProps<"div">): import("react").JSX.Element;
declare const fieldVariants: (props?: ({
    orientation?: "horizontal" | "vertical" | "responsive" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Field({ className, orientation, ...props }: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>): import("react").JSX.Element;
declare function FieldContent({ className, ...props }: React.ComponentProps<"div">): import("react").JSX.Element;
declare function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>): import("react").JSX.Element;
declare function FieldTitle({ className, ...props }: React.ComponentProps<"div">): import("react").JSX.Element;
declare function FieldDescription({ className, ...props }: React.ComponentProps<"p">): import("react").JSX.Element;
declare function FieldSeparator({ children, className, ...props }: React.ComponentProps<"div"> & {
    children?: React.ReactNode;
}): import("react").JSX.Element;
declare function FieldError({ className, children, errors, ...props }: React.ComponentProps<"div"> & {
    errors?: Array<{
        message?: string;
    } | undefined>;
}): import("react").JSX.Element | null;
export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSeparator, FieldSet, FieldContent, FieldTitle, };
