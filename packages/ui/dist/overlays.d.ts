import { type ReactNode, type CSSProperties } from "react";
export interface ModalProps {
    open?: boolean;
    isOpen?: boolean;
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    onClose: () => void;
    size?: "sm" | "md" | "lg" | "xl";
    maxWidth?: string;
    className?: string;
    closeOnEsc?: boolean;
    closeOnBackdrop?: boolean;
    showCloseButton?: boolean;
    ariaLabel?: string;
    contentStyle?: CSSProperties;
}
export declare function Modal({ open, isOpen, title, description, children, footer, onClose, size, maxWidth, className, closeOnEsc, closeOnBackdrop, showCloseButton, ariaLabel, contentStyle, }: ModalProps): import("react").JSX.Element;
export interface DrawerProps extends Omit<ModalProps, "maxWidth" | "size"> {
    width?: number | string;
}
export declare function Drawer({ open, isOpen, title, description, children, footer, onClose, className, closeOnEsc, width, }: DrawerProps): import("react").JSX.Element;
export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: ReactNode;
    message?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    confirmVariant?: "danger" | "primary";
    busy?: boolean;
    loading?: boolean;
    onConfirm: () => void | Promise<void>;
    onClose?: () => void;
    onCancel?: () => void;
}
export declare function ConfirmDialog({ open, title, description, message, confirmLabel, cancelLabel, danger, confirmVariant, busy, loading, onConfirm, onClose, onCancel, }: ConfirmDialogProps): import("react").JSX.Element;
export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    confirmVariant?: "danger" | "primary";
}
export declare function useConfirm(): {
    confirm: (next: ConfirmOptions) => Promise<boolean>;
    confirmDialog: import("react").JSX.Element;
};
