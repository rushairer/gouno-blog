import { type ReactNode, type HTMLAttributes, type FormHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type LabelHTMLAttributes, type Ref } from "react";
import { FieldLabel, FieldGroup, FieldSet, FieldLegend } from "./components/ui/field.js";
export { FieldGroup, FieldSet, FieldLegend, FieldLabel };
export type ControlSize = "regular" | "compact";
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
    size?: ControlSize;
    prefixIcon?: ReactNode;
    suffixIcon?: ReactNode;
    invalid?: boolean;
    isError?: boolean;
    ref?: Ref<HTMLInputElement>;
}
export declare function Input({ size, invalid, isError, prefixIcon, suffixIcon, className, ...props }: InputProps): import("react").JSX.Element;
export declare function Textarea({ invalid, isError, size: _size, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
    invalid?: boolean;
    isError?: boolean;
    size?: ControlSize;
    ref?: Ref<HTMLTextAreaElement>;
}): import("react").JSX.Element;
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
    size?: ControlSize | number;
    invalid?: boolean;
    isError?: boolean;
    ref?: Ref<HTMLSelectElement>;
}
/** Native select preserves form serialization and the apps' existing change-event contract. */
export declare function Select({ size, invalid, isError, className, children, ...props }: SelectProps): import("react").JSX.Element;
export declare function Field({ label, children, id, hint, error, required, className, noMargin: _noMargin, hideLabel, }: {
    label: ReactNode;
    children: ReactNode;
    id?: string;
    hint?: ReactNode;
    error?: ReactNode;
    required?: boolean;
    className?: string;
    noMargin?: boolean;
    hideLabel?: boolean;
}): import("react").JSX.Element;
export declare const FormField: typeof Field;
type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    label?: ReactNode;
    ref?: Ref<HTMLInputElement>;
};
export declare const Checkbox: (props: CheckProps) => import("react").JSX.Element;
export declare const Radio: (props: CheckProps) => import("react").JSX.Element;
export declare function Switch({ label, id, className, ...props }: CheckProps): import("react").JSX.Element;
export declare function CheckboxField({ children, className, ...props }: LabelHTMLAttributes<HTMLLabelElement>): import("react").JSX.Element;
export declare function CheckboxGroup({ label, children, }: {
    label: string;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function FormLayout({ className, ...props }: FormHTMLAttributes<HTMLFormElement>): import("react").JSX.Element;
export declare function FormGrid({ columns, className, ...props }: HTMLAttributes<HTMLDivElement> & {
    columns?: 1 | 2 | 3 | 4 | 5;
}): import("react").JSX.Element;
export declare function FormActions({ surface, className, ...props }: HTMLAttributes<HTMLDivElement> & {
    surface?: boolean;
}): import("react").JSX.Element;
export declare function OverlayForm({ actions, actionClassName, ...props }: FormHTMLAttributes<HTMLFormElement> & {
    actions: ReactNode;
    actionClassName?: string;
}): import("react").JSX.Element;
export declare function SearchField({ className, ...props }: InputProps): import("react").JSX.Element;
