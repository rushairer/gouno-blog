import { type ReactNode } from "react";
import { KeyRound, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useSudoMode } from "../../hooks/useSudoMode";
import { Button } from "../ui";

export interface SudoGateProps {
  children: ReactNode;
  title?: string;
  description?: string;
  actionLabel?: string;
  className?: string;
  /**
   * If true, allows users to view form content with an overlay lock,
   * but prevents interaction until unlocked.
   */
  locked?: boolean;
}

export function SudoGate({
  children,
  title = "高权限安全保护区域",
  description = "修改此区域的配置或执行敏感管理操作需要近期多因素身份验证。解锁后您将享有 10 分钟无打扰编辑期。",
  actionLabel = "解锁以进行修改",
  className = "",
  locked: forceLocked,
}: SudoGateProps) {
  const { isSudoActive, remainingMinutes, activating, activateSudo } =
    useSudoMode();

  const isLocked = forceLocked !== undefined ? forceLocked : !isSudoActive;

  if (!isLocked) {
    return (
      <div className={`sudo-gate-container sudo-gate--unlocked ${className}`}>
        <div
          className="sudo-gate-header-badge"
          role="status"
          aria-label="Sudo 安全提权已生效"
        >
          <ShieldCheck className="w-4 h-4 text-[var(--status-success-text)]" />
          <span>Sudo 已解锁（剩余约 {remainingMinutes} 分钟）</span>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={`sudo-gate-container sudo-gate--locked ${className}`}>
      <div className="sudo-gate-content-locked" inert={true} aria-hidden="true">
        {children}
      </div>

      <div
        className="sudo-gate-overlay"
        role="region"
        aria-label="Sudo 权限锁定"
      >
        <div className="sudo-gate-card">
          <div className="sudo-gate-icon-wrapper" aria-hidden="true">
            <div className="sudo-gate-icon-glow" />
            <div className="sudo-gate-icon">
              <Lock />
            </div>
          </div>
          <div className="sudo-gate-info">
            <h3 className="sudo-gate-title">{title}</h3>
            <p className="sudo-gate-desc">{description}</p>
          </div>
          <div className="sudo-gate-actions">
            <Button
              variant="primary"
              size="default"
              loading={activating}
              onClick={() => void activateSudo()}
              icon={activating ? <Sparkles /> : <KeyRound />}
            >
              {actionLabel}
            </Button>
          </div>
          <span className="sudo-gate-tip">
            ✓ 安全认证由统一身份中心提供，完成后自动解锁当前视图
          </span>
        </div>
      </div>
    </div>
  );
}
