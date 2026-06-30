import type React from 'react';
import { BookOpen } from 'lucide-react';

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

export function Panel({
  children,
  className = '',
  as: Component = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return <Component className={`panel ${className}`.trim()}>{children}</Component>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Feedback({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  return <div className={`feedback feedback--${type}`}>{children}</div>;
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
