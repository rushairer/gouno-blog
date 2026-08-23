import type React from 'react';
import { classes } from './classes';

export function StatusIndicator({ status, label, className = '' }: { status: string; label: React.ReactNode; className?: string }) {
  return <span className={classes('status-pill', `status-pill--${status}`, className)}>{label}</span>;
}

export function RiskBadge({ level, label, className = '' }: { level: string; label: React.ReactNode; className?: string }) {
  return <span className={classes('risk-label', `risk-label--${level}`, className)}>{label}</span>;
}
