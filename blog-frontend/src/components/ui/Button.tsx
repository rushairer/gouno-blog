import { forwardRef } from 'react';
import type React from 'react';
import { classes } from './classes';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'regular' | 'compact';

export function buttonClassName({
  variant = 'secondary',
  size = 'regular',
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return classes('btn', `btn-${variant}`, size === 'compact' && 'btn--compact', className);
}

export function Button({
  variant = 'secondary',
  size = 'regular',
  className = '',
  loading = false,
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button className={buttonClassName({ variant, size, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {children}
    </button>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  function IconButton({ children, label, className = '', ...props }, ref) {
    return (
      <button ref={ref} className={classes('icon-button', className)} aria-label={label} title={label} {...props}>
        {children}
      </button>
    );
  },
);
