import { riskLabel, statusLabel } from './labels';

export function StatusPill({
  status,
  locale,
  label,
}: {
  status: string;
  locale: 'en' | 'zh';
  label?: string;
}) {
  return <span className={`status-pill status-pill--${status}`}>{label || statusLabel(status, locale)}</span>;
}

export function RiskPill({ risk, locale, label }: { risk: string; locale: 'en' | 'zh'; label?: string }) {
  return <span className={`risk-label risk-label--${risk}`}>{label || riskLabel(risk, locale)}</span>;
}
