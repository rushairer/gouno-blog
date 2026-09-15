import { type ReactNode } from "react";
import { KeyRound } from "lucide-react";
import { useSudoMode } from "../../hooks/useSudoMode";
import { Alert, Button } from "@gouno/ui/core";

export interface SudoGateProps {
  children: ReactNode;
  title?: string;
  description?: string;
  actionLabel?: string;
  className?: string;
  /** Forces the visual lock state for controlled/test scenarios. */
  locked?: boolean;
}

export function SudoGate({
  children,
  title = "高权限操作保护",
  description = "修改此区域的配置或执行敏感管理操作需要近期多因素身份验证。",
  actionLabel = "验证并解锁",
  className = "",
  locked: forceLocked,
}: SudoGateProps) {
  const {
    isSudoActive,
    isSudoExpiring,
    remainingMinutes,
    activating,
    activateSudo,
    clearSudo,
  } = useSudoMode();

  const locked = forceLocked !== undefined ? forceLocked : !isSudoActive;
  const expiring = forceLocked === undefined && !locked && isSudoExpiring;
  const type = locked ? "info" : expiring ? "warning" : "success";
  const statusTitle = locked
    ? "高权限操作需要身份验证"
    : expiring
      ? "近期 MFA 即将过期"
      : "高权限操作已解锁";
  const sessionDescription = locked
    ? "完成近期 MFA 后可继续。"
    : expiring
      ? "下一次高权限写操作将触发 Step-Up；待执行动作会被保留并在验证后继续。"
      : `当前近期 MFA 已完成；约 ${remainingMinutes} 分钟后会重新要求验证。`;

  return (
    <div
      className={`flex flex-col gap-4 ${className}`}
      data-slot="blog-privileged-access-gate"
    >
      <Alert
        type={type}
        showIcon
        title={statusTitle}
        description={
          <span>
            <strong className="font-medium">{title}</strong>：{description}{" "}
            {sessionDescription}
          </span>
        }
        action={
          locked ? (
            <Button
              size="small"
              variant="solid"
              color="primary"
              loading={activating}
              loadingText="正在打开验证…"
              onClick={() => void activateSudo()}
              icon={<KeyRound />}
            >
              {actionLabel}
            </Button>
          ) : (
            <Button
              size="small"
              type="button"
              variant="outline"
              onClick={clearSudo}
            >
              重新锁定
            </Button>
          )
        }
      />

      {locked ? (
        <div className="hidden" inert={true} aria-hidden="true">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
