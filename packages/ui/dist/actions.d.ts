import { type ComponentType, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link" | "default" | "destructive" | "outline";
export type ButtonSize = "sm" | "default" | "lg" | "icon" | "regular" | "base" | "compact";
export type ButtonIconPosition = "left" | "right";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: ReactNode;
    iconPosition?: ButtonIconPosition;
    ref?: Ref<HTMLButtonElement>;
}
export declare function Button({ variant, size, loading, icon, iconPosition, children, disabled, type, ...props }: ButtonProps): import("react").JSX.Element;
export interface IconButtonProps extends Omit<ButtonProps, "children"> {
    label: string;
    icon: ReactNode;
}
export declare function IconButton({ label, icon, size: _size, variant, ...props }: IconButtonProps): import("react").JSX.Element;
interface LinkAdapterProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
    to: string;
    ref?: Ref<HTMLAnchorElement>;
}
export declare function NavigationProvider({ link, children, }: {
    link: ComponentType<LinkAdapterProps>;
    children: ReactNode;
}): import("react").JSX.Element;
export interface ButtonLinkProps extends LinkAdapterProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: ReactNode;
    iconPosition?: ButtonIconPosition;
    disabled?: boolean;
}
export declare function ButtonLink({ variant, size, icon, iconPosition, disabled, children, onClick, className, ...props }: ButtonLinkProps): import("react").JSX.Element;
export declare function IconButtonLink({ label, icon, className, variant, ...props }: ButtonLinkProps & {
    label: string;
    icon: ReactNode;
}): import("react").JSX.Element;
export declare function ChoiceButton({ selected, className, ...props }: ButtonProps & {
    selected?: boolean;
}): import("react").JSX.Element;
export {};
