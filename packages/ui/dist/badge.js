import { jsx as _jsx } from "react/jsx-runtime";
import { Badge as PrimitiveBadge } from "./components/ui/badge.js";
import { cn } from "./lib/utils.js";
const colors = {
    neutral: "bg-muted text-muted-foreground border-border",
    brand: "bg-accent text-accent-foreground border-primary/30",
    success: "bg-success-subtle text-success border-success/30",
    warning: "bg-warning-subtle text-warning border-warning/30",
    danger: "bg-danger-subtle text-destructive border-destructive/30",
    info: "bg-info-subtle text-info border-info/30",
};
export function Badge({ tone = "neutral", pill: _pill, variant: _variant, className, ...props }) {
    return (_jsx(PrimitiveBadge, { ...props, variant: "outline", className: cn("badge", `badge--${tone}`, "rounded-sm px-1.5 py-0.5 font-medium", colors[tone], className) }));
}
export function StatusIndicator({ status, label, className, }) {
    const tone = /^(success|published|completed|active|approved|delivered)$/.test(status)
        ? "success"
        : /^(danger|failed|rejected|error)$/.test(status)
            ? "danger"
            : /^(warning|pending|draft|running|waiting_for_user|awaiting_approval)$/.test(status)
                ? "warning"
                : "neutral";
    return (_jsx(Badge, { tone: tone, className: cn(`status-pill--${status}`, className), children: label }));
}
export function RiskBadge({ level, label, className, }) {
    return (_jsx(Badge, { className: className, tone: ["high", "critical"].includes(level)
            ? "danger"
            : ["medium", "moderate"].includes(level)
                ? "warning"
                : "neutral", children: label }));
}
export const Tag = Badge;
export function StatusBadge({ status = "draft", children, label, tone, compact, className, }) {
    const text = children ||
        label ||
        {
            published: "已发布",
            draft: "草稿",
            scheduled: "定时发布",
            hidden: "已隐藏",
        }[status] ||
        status;
    return tone ? (_jsx(Badge, { tone: tone, className: cn(`status-badge status-badge--${status} status-pill`, compact && "compact", className), children: text })) : (_jsx(StatusIndicator, { status: status, label: text, className: cn(`status-badge status-badge--${status} status-pill`, compact && "compact", className) }));
}
