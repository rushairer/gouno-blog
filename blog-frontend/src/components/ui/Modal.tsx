import { useEffect, useId, useRef } from 'react';
import type React from 'react';
import { X } from 'lucide-react';
import { classes } from './classes';
import { Button, IconButton } from './Button';

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
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      if (!containerRef.current?.contains(document.activeElement)) closeButton.current?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keydown);
      previousFocus.current?.focus();
    };
  }, [closeButton, containerRef, open]);
}

export function Modal({
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
  const closeButton = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const titleID = useId();
  const descriptionID = useId();
  useOverlayDialog(open, onClose, containerRef, closeButton);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={containerRef} className={`modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleID} aria-describedby={description ? descriptionID : undefined}>
        <header>
          <div><h2 id={titleID}>{title}</h2>{description ? <p id={descriptionID}>{description}</p> : null}</div>
          <IconButton ref={closeButton} label="关闭弹窗" type="button" onClick={onClose}><X /></IconButton>
        </header>
        {children}
      </section>
    </div>
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
  const closeButton = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const titleID = useId();
  const descriptionID = useId();
  useOverlayDialog(open, onClose, containerRef, closeButton);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={containerRef} className={classes('drawer', className)} role="dialog" aria-modal="true" aria-labelledby={titleID} aria-describedby={description ? descriptionID : undefined}>
        <header>
          <div><h2 id={titleID}>{title}</h2>{description ? <p id={descriptionID}>{description}</p> : null}</div>
          <IconButton ref={closeButton} label="关闭面板" type="button" onClick={onClose}><X /></IconButton>
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
  confirmLabel = '确认',
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
    <Modal open={open} title={title} onClose={busy ? () => undefined : onClose}>
      <div className="confirm-dialog">
        <p>{description}</p>
        <div className="modal-actions">
          <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>取消</Button>
          <Button variant={danger ? 'danger' : 'primary'} type="button" disabled={busy} onClick={() => void onConfirm()}>
            {busy ? '正在处理…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
