import { Tag, type TagColor } from "@gouno/ui/core";
import { riskLabel, statusLabel } from "./labels";

function statusColor(status: string): TagColor {
  if (/^(success|published|completed|active|approved|delivered)$/.test(status)) {
    return "success";
  }
  if (/^(danger|failed|rejected|error)$/.test(status)) return "error";
  if (
    /^(warning|pending|draft|running|waiting_for_user|awaiting_approval)$/.test(
      status,
    )
  ) {
    return "warning";
  }
  return "default";
}

function riskColor(risk: string): TagColor {
  if (["high", "critical"].includes(risk)) return "error";
  if (["medium", "moderate"].includes(risk)) return "warning";
  return "default";
}

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
    <Tag color={statusColor(status)} className={`status-pill--${status}`}>
      {label || statusLabel(status, locale)}
    </Tag>
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
  return <Tag color={riskColor(risk)}>{label || riskLabel(risk, locale)}</Tag>;
}
