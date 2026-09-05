import { ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { useSudoMode } from "../../hooks/useSudoMode";
import { Button } from "../ui";

export interface SudoBannerProps {
  className?: string;
  compact?: boolean;
  title?: string;
  description?: string;
  onActivated?: () => void;
}

export function SudoBanner({
  className = "",
  compact = false,
  title = "高权限安全保护区域",
  description = "此区域涉及站点核心安全与权限配置。建议在编辑前提前激活 Sudo 提权，以确保后续保存无需被打断。",
  onActivated,
}: SudoBannerProps) {
  const { isSudoActive, remainingMinutes, activating, activateSudo } =
    useSudoMode();

  if (isSudoActive) {
    return (
      <aside
        className={`sudo-banner sudo-banner--active ${className}`}
        role="status"
        aria-label="Sudo 安全提权状态"
      >
        <div className="sudo-banner__content">
          <div
            className="sudo-banner__icon sudo-banner__icon--active"
            aria-hidden="true"
          >
            <ShieldCheck />
          </div>
          <div className="sudo-banner__text">
            <span className="sudo-banner__title">Sudo 安全提权已激活</span>
            <span className="sudo-banner__badge">
              剩余有效时间约 {remainingMinutes} 分钟
            </span>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`sudo-banner sudo-banner--inactive ${compact ? "sudo-banner--compact" : ""} ${className}`}
      role="region"
      aria-label="Sudo 提权提示"
    >
      <div className="sudo-banner__content">
        <div
          className="sudo-banner__icon sudo-banner__icon--warning"
          aria-hidden="true"
        >
          <ShieldAlert />
        </div>
        <div className="sudo-banner__text">
          <strong className="sudo-banner__title">{title}</strong>
          {!compact ? <p className="sudo-banner__desc">{description}</p> : null}
        </div>
      </div>
      <div className="sudo-banner__actions">
        <Button
          variant="secondary"
          size="compact"
          loading={activating}
          onClick={() => void activateSudo(onActivated)}
          icon={activating ? <Sparkles /> : <ShieldCheck />}
        >
          立即激活 Sudo 提权
        </Button>
      </div>
    </aside>
  );
}
