import { riskLabel, statusLabel } from "./labels";
import { RiskBadge, StatusIndicator } from "../ui";

export function StatusPill({
  status,
  locale,
  label,
}: {
  status: string;
  locale: "en" | "zh";
  label?: string;
}) {
  return (
    <StatusIndicator
      status={status}
      label={label || statusLabel(status, locale)}
    />
  );
}

export function RiskPill({
  risk,
  locale,
  label,
}: {
  risk: string;
  locale: "en" | "zh";
  label?: string;
}) {
  return <RiskBadge level={risk} label={label || riskLabel(risk, locale)} />;
}
