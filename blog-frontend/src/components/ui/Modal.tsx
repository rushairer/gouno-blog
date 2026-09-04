import { useEffect, useId, useRef } from "react";
import type React from "react";
import { X } from "lucide-react";
import { Button, IconButton } from "./Button";
import { classes } from "./classes";
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
  className,
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
        className={classes("modal", modalSizeClasses[size], className)}
        closeLabel="关闭弹窗"
      >
        <DialogHeader className="modal-header">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
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
  className,
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
    <div className="drawer-backdrop">
      <div
        className="drawer-scrim"
        role="presentation"
        aria-hidden="true"
        onClick={onClose}
      />
      <section
        ref={containerRef}
        className={`drawer${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleID}
        aria-describedby={description ? descriptionID : undefined}
      >
        <header>
          <div>
            <h2 id={titleID}>{title}</h2>
            {description ? <p id={descriptionID}>{description}</p> : null}
          </div>
          <IconButton
            ref={closeButton}
            label="关闭面板"
            icon={<X />}
            type="button"
            onClick={onClose}
          />
        </header>
        {children}
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
      <div className="confirm-dialog">
        <p>{description}</p>
      </div>
    </Modal>
  );
}
