import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, X } from 'lucide-react';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-header__action">{action}</div>}
    </div>
  );
}

export function AdminPage({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`admin-page ${className}`.trim()}>{children}</div>;
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-heading">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}

export function AdminPageState({
  title,
  description,
  label,
}: {
  title: string;
  description?: React.ReactNode;
  label: string;
}) {
  return (
    <AdminPage>
      <AdminPageHeader title={title} description={description} />
      <LoadingState label={label} />
    </AdminPage>
  );
}

export function Panel({
  children,
  className = '',
  as: Component = 'section',
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
} & Record<string, unknown>) {
  return <Component className={`panel ${className}`.trim()} {...props}>{children}</Component>;
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const control = isValidElement<{ className?: string }>(children)
    ? cloneElement(children, { className: `input-field ${children.props.className || ''}`.trim() })
    : children;
  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      {control}
    </label>
  );
}

export function Feedback({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  return <div className={`feedback feedback--${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state state--loading">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="state">
      <BookOpen aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="state state--error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <p>{label}</p>
      {action ? <div className="state__actions">{action}</div> : null}
    </div>
  );
}

export function IconButton({
  children,
  label,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

type ToastType = 'success' | 'error';
interface ToastMessage { id: number; message: string; type: ToastType }
interface ToastContextValue { notify: (message: string, type?: ToastType) => void }
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextID = useRef(0);
  const notify = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextID.current;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.type}`} key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}>
            {toast.type === 'success' ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
            <span>{toast.message}</span>
            <button type="button" aria-label="关闭提示" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components -- shared with the colocated provider by design.
export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

// oxlint-disable-next-line react/only-export-components -- small UI feedback helper, not a component.
export async function copyText(value: string, notify: ToastContextValue['notify'], successMessage = '已复制到剪贴板。') {
  try {
    await navigator.clipboard.writeText(value);
    notify(successMessage);
    return true;
  } catch {
    notify('复制失败，请检查浏览器剪贴板权限。', 'error');
    return false;
  }
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
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
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? 'modal-description' : undefined}>
        <header>
          <div><h2 id="modal-title">{title}</h2>{description ? <p id="modal-description">{description}</p> : null}</div>
          <button ref={closeButton} className="icon-button" type="button" aria-label="关闭弹窗" onClick={onClose}><X /></button>
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
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} type="button" disabled={busy} onClick={() => void onConfirm()}>
            {busy ? '正在处理…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
