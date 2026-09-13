import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, } from "./components/ui/dialog.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, } from "./components/ui/sheet.js";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, } from "./components/ui/alert-dialog.js";
import { Button } from "./actions.js";
import { cn } from "./lib/utils.js";
const closeText = () => typeof document !== "undefined" &&
    document.documentElement.lang.startsWith("en")
    ? "Close"
    : "关闭";
export function Modal({ open, isOpen, title, description, children, footer, onClose, size = "md", maxWidth, className, closeOnEsc = true, closeOnBackdrop = false, showCloseButton = true, ariaLabel, contentStyle, }) {
    const previousFocus = useRef(null);
    const visible = open ?? isOpen ?? false;
    useEffect(() => {
        if (visible)
            previousFocus.current =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
        return () => {
            if (previousFocus.current?.isConnected)
                previousFocus.current.focus();
        };
    }, [visible]);
    useLayoutEffect(() => {
        if (visible) {
            const control = document.querySelector("[data-state='open'] [autofocus], [data-state='open'] [autoFocus]");
            control?.focus();
        }
    }, [visible]);
    useEffect(() => {
        if (!visible || !closeOnEsc)
            return;
        const onKeyDown = (event) => {
            if (event.key === "Escape")
                onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [visible, closeOnEsc, onClose]);
    return (_jsx(Dialog, { open: visible, onOpenChange: (next) => {
            if (!next)
                onClose();
        }, children: _jsxs(DialogContent, { className: cn({
                sm: "sm:max-w-md",
                md: "sm:max-w-xl",
                lg: "sm:max-w-3xl",
                xl: "sm:max-w-5xl",
            }[size], className), style: { maxWidth, ...contentStyle }, showCloseButton: showCloseButton, onEscapeKeyDown: (e) => {
                if (!closeOnEsc)
                    e.preventDefault();
            }, onPointerDownOutside: (e) => {
                if (!closeOnBackdrop)
                    e.preventDefault();
            }, onCloseAutoFocus: (e) => {
                if (previousFocus.current?.isConnected) {
                    e.preventDefault();
                    previousFocus.current.focus();
                }
            }, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { className: title ? undefined : "sr-only", children: title || ariaLabel || closeText() }), description ? (_jsx(DialogDescription, { children: description })) : null] }), _jsx("div", { className: "min-w-0 py-2", children: children }), footer ? (_jsx("div", { className: "flex flex-wrap justify-end gap-3 border-t pt-4", children: footer })) : null] }) }));
}
export function Drawer({ open, isOpen, title, description, children, footer, onClose, className, closeOnEsc = true, width, }) {
    const previousFocus = useRef(null);
    const visible = open ?? isOpen ?? false;
    useEffect(() => {
        if (visible)
            previousFocus.current =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
        return () => {
            if (previousFocus.current?.isConnected)
                previousFocus.current.focus();
        };
    }, [visible]);
    useEffect(() => {
        if (!visible || !closeOnEsc)
            return;
        const onKeyDown = (event) => {
            if (event.key === "Escape")
                onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [visible, closeOnEsc, onClose]);
    return (_jsx(Sheet, { open: visible, onOpenChange: (next) => {
            if (!next)
                onClose();
        }, children: _jsxs(SheetContent, { className: cn("flex w-full flex-col gap-0 sm:max-w-xl", className), style: width ? { maxWidth: width } : undefined, onEscapeKeyDown: (e) => {
                if (!closeOnEsc)
                    e.preventDefault();
            }, onCloseAutoFocus: (e) => {
                if (previousFocus.current?.isConnected) {
                    e.preventDefault();
                    previousFocus.current.focus();
                }
            }, children: [_jsxs(SheetHeader, { className: "border-b p-5", children: [_jsx(SheetTitle, { children: title || closeText() }), description ? (_jsx(SheetDescription, { children: description })) : null] }), _jsx("div", { className: "min-h-0 flex-1 overflow-auto p-5", children: children }), footer ? (_jsx("div", { className: "flex flex-wrap justify-end gap-3 border-t p-5", children: footer })) : null] }) }));
}
export function ConfirmDialog({ open, title, description, message, confirmLabel, cancelLabel, danger = false, confirmVariant, busy, loading, onConfirm, onClose, onCancel, }) {
    const pending = busy || loading;
    const close = onClose || onCancel || (() => { });
    const en = true;
    useEffect(() => {
        if (!open || pending)
            return;
        const handleBackdropClick = (event) => {
            const target = event.target;
            if (!target?.closest('[data-slot="alert-dialog-content"]'))
                close();
        };
        document.addEventListener("click", handleBackdropClick);
        return () => document.removeEventListener("click", handleBackdropClick);
    }, [open, pending, close]);
    return (_jsx(AlertDialog, { open: open, onOpenChange: (next) => {
            if (!next && !pending)
                close();
        }, children: _jsxs(AlertDialogContent, { role: "dialog", children: [_jsxs(AlertDialogHeader, { children: [_jsx(AlertDialogTitle, { children: title }), _jsx(AlertDialogDescription, { asChild: true, children: _jsx("div", { children: message || description }) })] }), _jsxs(AlertDialogFooter, { children: [_jsx(Button, { autoFocus: true, onClick: close, disabled: pending, children: cancelLabel || (en ? "Cancel" : "取消") }), _jsx(Button, { variant: danger || confirmVariant === "danger" ? "danger" : "primary", onClick: () => void onConfirm(), loading: pending, children: confirmLabel || (en ? "Confirm" : "确认") })] })] }) }));
}
export function useConfirm() {
    const [options, setOptions] = useState(null);
    const resolver = useRef(null);
    const settle = useCallback((value) => {
        resolver.current?.(value);
        resolver.current = null;
        setOptions(null);
    }, []);
    const confirm = useCallback((next) => {
        resolver.current?.(false);
        return new Promise((resolve) => {
            resolver.current = resolve;
            setOptions(next);
        });
    }, []);
    useEffect(() => () => {
        resolver.current?.(false);
    }, []);
    return {
        confirm,
        confirmDialog: (_jsx(ConfirmDialog, { open: !!options, title: options?.title || "", message: options?.message, confirmLabel: options?.confirmLabel, confirmVariant: options?.confirmVariant || "danger", onConfirm: () => settle(true), onCancel: () => settle(false) })),
    };
}
