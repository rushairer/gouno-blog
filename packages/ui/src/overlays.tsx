import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "./components/ui/alert-dialog";
import { Button } from "./actions";
import { cn } from "./lib/utils";
const closeText = () =>
  typeof document !== "undefined" &&
  document.documentElement.lang.startsWith("en")
    ? "Close"
    : "关闭";
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
export function Modal({
  open,
  isOpen,
  title,
  description,
  children,
  footer,
  onClose,
  size = "md",
  maxWidth,
  className,
  closeOnEsc = true,
  closeOnBackdrop = false,
  showCloseButton = true,
  ariaLabel,
  contentStyle,
}: ModalProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const visible = open ?? isOpen ?? false;
  useEffect(() => {
    if (visible)
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
  }, [visible]);
  return (
    <Dialog
      open={visible}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={cn(
          {
            sm: "sm:max-w-md",
            md: "sm:max-w-xl",
            lg: "sm:max-w-3xl",
            xl: "sm:max-w-5xl",
          }[size],
          className,
        )}
        style={{ maxWidth, ...contentStyle }}
        showCloseButton={showCloseButton}
        onEscapeKeyDown={(e) => {
          if (!closeOnEsc) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (!closeOnBackdrop) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          if (previousFocus.current?.isConnected) {
            e.preventDefault();
            previousFocus.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className={title ? undefined : "sr-only"}>
            {title || ariaLabel || closeText()}
          </DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="min-w-0 py-2">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
export interface DrawerProps extends Omit<ModalProps, "maxWidth" | "size"> {
  width?: number | string;
}
export function Drawer({
  open,
  isOpen,
  title,
  description,
  children,
  footer,
  onClose,
  className,
  closeOnEsc = true,
  width,
}: DrawerProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const visible = open ?? isOpen ?? false;
  useEffect(() => {
    if (visible)
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
  }, [visible]);
  return (
    <Sheet
      open={visible}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        className={cn("flex w-full flex-col gap-0 sm:max-w-xl", className)}
        style={width ? { maxWidth: width } : undefined}
        onEscapeKeyDown={(e) => {
          if (!closeOnEsc) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          if (previousFocus.current?.isConnected) {
            e.preventDefault();
            previousFocus.current.focus();
          }
        }}
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{title || closeText()}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t p-5">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
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
export function ConfirmDialog({
  open,
  title,
  description,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  confirmVariant,
  busy,
  loading,
  onConfirm,
  onClose,
  onCancel,
}: ConfirmDialogProps) {
  const pending = busy || loading;
  const close = onClose || onCancel || (() => {});
  const en = true;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) close();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{message || description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button autoFocus onClick={close} disabled={pending}>
            {cancelLabel || (en ? "Cancel" : "取消")}
          </Button>
          <Button
            variant={
              danger || confirmVariant === "danger" ? "danger" : "primary"
            }
            onClick={() => void onConfirm()}
            loading={pending}
          >
            {confirmLabel || (en ? "Confirm" : "确认")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
}
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);
  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);
  useEffect(
    () => () => {
      resolver.current?.(false);
    },
    [],
  );
  return {
    confirm,
    confirmDialog: (
      <ConfirmDialog
        open={!!options}
        title={options?.title || ""}
        message={options?.message}
        confirmLabel={options?.confirmLabel}
        confirmVariant={options?.confirmVariant || "danger"}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    ),
  };
}
