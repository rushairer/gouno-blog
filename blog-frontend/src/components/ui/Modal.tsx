import { useEffect, useId, useRef } from 'react';
import type React from 'react';
import { X } from 'lucide-react';
import { classes } from './classes';
import { Button, IconButton } from './Button';

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
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? 'modal-description' : undefined}>
        <header>
          <div><h2 id="modal-title">{title}</h2>{description ? <p id="modal-description">{description}</p> : null}</div>
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
  const titleID = useId();
  const descriptionID = useId();
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={classes('drawer', className)} role="dialog" aria-modal="true" aria-labelledby={titleID} aria-describedby={description ? descriptionID : undefined}>
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
