import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type React from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, X } from 'lucide-react';
import { classes } from './classes';

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

export function EmptyState({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="state">
      <BookOpen aria-hidden="true" />
      <p>{label}</p>
      {action ? <div className="state__actions">{action}</div> : null}
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

export type ToastType = 'success' | 'error';
export interface ToastMessage { id: number; message: string; type: ToastType }
export interface ToastContextValue { notify: (message: string, type?: ToastType) => void }
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

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

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

export type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span className={classes('badge', tone !== 'neutral' && `badge--${tone}`, className)}>
      {children}
    </span>
  );
}

export type PostStatus = 'published' | 'draft' | 'scheduled' | 'hidden';

export function StatusBadge({
  status = 'draft',
  className = '',
  label,
}: {
  status?: PostStatus | string;
  className?: string;
  label?: React.ReactNode;
}) {
  const normalizedStatus = status || 'draft';
  const defaultLabels: Record<string, string> = {
    published: '已发布',
    draft: '草稿',
    scheduled: '定时发布',
    hidden: '已隐藏',
  };
  return (
    <span className={classes('status-badge', `status-badge--${normalizedStatus}`, className)}>
      {label || defaultLabels[normalizedStatus] || normalizedStatus}
    </span>
  );
}
