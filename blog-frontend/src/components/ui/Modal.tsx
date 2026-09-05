import { useEffect, useId, useRef } from "react";
import type React from "react";
import { X } from "lucide-react";
import { Button, IconButton } from "./Button";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./Dialog";

function useOverlayDialog(
  open: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
  closeButton: React.RefObject<HTMLButtonElement | null>,
) {
  const onCloseRef = useRef(onClose);
  const previousFocus = useRef<HTMLElement | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => {
      if (!containerRef.current?.contains(document.activeElement))
        closeButton.current?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keydown);
      previousFocus.current?.focus();
    };
  }, [closeButton, containerRef, open]);
}

export type ModalSize = "sm" | "md" | "lg" | "xl";

const modalSizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  className = "",
  size = "md",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  className?: string;
  size?: ModalSize;
}) {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className={cn(modalSizeClasses[size], className)}
        closeLabel="关闭弹窗"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="py-2">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function Drawer({
  open,
  title,
  description,
  children,
  onClose,
  className = "",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const titleID = useId();
  const descriptionID = useId();
  const containerRef = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  useOverlayDialog(open, onClose, containerRef, closeButton);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        role="presentation"
        aria-hidden="true"
        onClick={onClose}
      />
      <section
        ref={containerRef}
        className={cn(
          "relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-card p-6 text-card-foreground shadow-2xl transition-transform",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleID}
        aria-describedby={description ? descriptionID : undefined}
      >
        <header className="flex items-start justify-between pb-4 border-b border-border">
          <div>
            <h2 id={titleID} className="text-lg font-bold text-foreground">
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionID}
                className="mt-1 text-sm text-muted-foreground"
              >
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            ref={closeButton}
            label="关闭面板"
            icon={<X className="h-4 w-4" />}
            type="button"
            onClick={onClose}
          />
        </header>
        <div className="flex-1 overflow-y-auto py-4">{children}</div>
      </section>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            type="button"
            loading={busy}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "正在处理…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </div>
    </Modal>
  );
}
