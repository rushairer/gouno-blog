import type React from 'react';
import { AlertTriangle, BookOpen } from 'lucide-react';
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

export async function copyText(value: string, notify: (message: string, tone?: 'success' | 'error') => void, successMessage = '已复制到剪贴板。') {
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
